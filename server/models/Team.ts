import fs from "fs";
import path from "path";
import { URL } from "url";
import util from "util";
import { Op } from "sequelize";
import {
  Column,
  IsLowercase,
  NotIn,
  Default,
  Table,
  Unique,
  IsIn,
  BeforeSave,
  HasMany,
  Scopes,
  Length,
  Is,
  DataType,
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { stripSubdomain, RESERVED_SUBDOMAINS } from "@shared/utils/domains";
import env from "@server/env";
import Logger from "@server/logging/logger";
import { generateAvatarUrl } from "@server/utils/avatars";
import { publicS3Endpoint, uploadToS3FromUrl } from "@server/utils/s3";
import AuthenticationProvider from "./AuthenticationProvider";
import Collection from "./Collection";
import Document from "./Document";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";
import Fix from "./decorators/Fix";

const readFile = util.promisify(fs.readFile);

@Scopes(() => ({
  withAuthenticationProviders: {
    include: [
      {
        model: AuthenticationProvider,
        as: "authenticationProviders",
      },
    ],
  },
}))
@Table({ tableName: "teams", modelName: "team" })
@Fix
class Team extends ParanoidModel {
  @Column
  name: string;

  @IsLowercase
  @Unique
  @Length({ min: 4, max: 32, msg: "Must be between 4 and 32 characters" })
  @Is({
    args: [/^[a-z\d-]+$/, "i"],
    msg: "Must be only alphanumeric and dashes",
  })
  @NotIn({
    args: [RESERVED_SUBDOMAINS],
    msg: "You chose a restricted word, please try another.",
  })
  @Column
  subdomain: string | null;

  @Unique
  @Column
  domain: string | null;

  @Column(DataType.UUID)
  defaultCollectionId: string | null;

  @Column
  avatarUrl: string | null;

  @Default(true)
  @Column
  sharing: boolean;

  @Default(true)
  @Column(DataType.JSONB)
  signupQueryParams: { [key: string]: string } | null;

  @Default(true)
  @Column
  guestSignin: boolean;

  @Default(true)
  @Column
  documentEmbeds: boolean;

  @Default(false)
  @Column
  collaborativeEditing: boolean;

  @Default("member")
  @IsIn([["viewer", "member"]])
  @Column
  defaultUserRole: string;

  // getters

  /**
   * Returns whether the team has email login enabled. For self-hosted installs
   * this also considers whether SMTP connection details have been configured.
   *
   * @return {boolean} Whether to show email login options
   */
  get emailSigninEnabled(): boolean {
    return (
      this.guestSignin && (!!env.SMTP_HOST || env.NODE_ENV === "development")
    );
  }

  get url() {
    if (this.domain) {
      return `https://${this.domain}`;
    }

    if (!this.subdomain || process.env.SUBDOMAINS_ENABLED !== "true") {
      return process.env.URL;
    }

    const url = new URL(process.env.URL || "");
    url.host = `${this.subdomain}.${stripSubdomain(url.host)}`;
    return url.href.replace(/\/$/, "");
  }

  get logoUrl() {
    return (
      this.avatarUrl ||
      generateAvatarUrl({
        id: this.id,
        name: this.name,
      })
    );
  }

  // TODO: Move to command
  provisionSubdomain = async function (
    requestedSubdomain: string,
    options = {}
  ) {
    if (this.subdomain) {
      return this.subdomain;
    }
    let subdomain = requestedSubdomain;
    let append = 0;

    for (;;) {
      try {
        await this.update(
          {
            subdomain,
          },
          options
        );
        break;
      } catch (err) {
        // subdomain was invalid or already used, try again
        subdomain = `${requestedSubdomain}${++append}`;
      }
    }

    return subdomain;
  };

  provisionFirstCollection = async function (userId: string) {
    const collection = await Collection.create({
      name: "Welcome",
      description:
        "This collection is a quick guide to what Outline is all about. Feel free to delete this collection once your team is up to speed with the basics!",
      teamId: this.id,
      createdById: userId,
      sort: Collection.DEFAULT_SORT,
      permission: "read_write",
    });

    // For the first collection we go ahead and create some intitial documents to get
    // the team started. You can edit these in /server/onboarding/x.md
    const onboardingDocs = [
      "Integrations & API",
      "Our Editor",
      "Getting Started",
      "What is Outline",
    ];

    for (const title of onboardingDocs) {
      const text = await readFile(
        path.join(process.cwd(), "server", "onboarding", `${title}.md`),
        "utf8"
      );
      const document = await Document.create({
        version: 2,
        isWelcome: true,
        parentDocumentId: null,
        collectionId: collection.id,
        teamId: collection.teamId,
        userId: collection.createdById,
        lastModifiedById: collection.createdById,
        createdById: collection.createdById,
        title,
        text,
      });
      await document.publish(collection.createdById);
    }
  };

  collectionIds = async function (paranoid = true) {
    const models = await Collection.findAll({
      attributes: ["id"],
      where: {
        teamId: this.id,
        permission: {
          [Op.ne]: null,
        },
      },
      paranoid,
    });
    return models.map((c) => c.id);
  };

  // associations

  @HasMany(() => Collection)
  collections: Collection[];

  @HasMany(() => Document)
  documents: Document[];

  @HasMany(() => User)
  users: User[];

  @HasMany(() => AuthenticationProvider)
  authenticationProviders: AuthenticationProvider[];

  // hooks

  @BeforeSave
  static uploadAvatar = async (model: Team) => {
    const endpoint = publicS3Endpoint();
    const { avatarUrl } = model;

    if (
      avatarUrl &&
      !avatarUrl.startsWith("/api") &&
      !avatarUrl.startsWith(endpoint)
    ) {
      try {
        const newUrl = await uploadToS3FromUrl(
          avatarUrl,
          `avatars/${model.id}/${uuidv4()}`,
          "public-read"
        );
        if (newUrl) {
          model.avatarUrl = newUrl;
        }
      } catch (err) {
        Logger.error("Error uploading avatar to S3", err, {
          url: avatarUrl,
        });
      }
    }
  };
}

export default Team;
