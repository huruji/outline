import { find } from "lodash";
import { observer } from "mobx-react";
import { BackIcon, EmailIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, Link, Redirect } from "react-router-dom";
import styled from "styled-components";
import { setCookie } from "tiny-cookie";
import { Config } from "~/stores/AuthStore";
import ButtonLarge from "~/components/ButtonLarge";
import Fade from "~/components/Fade";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import NoticeAlert from "~/components/NoticeAlert";
import OutlineLogo from "~/components/OutlineLogo";
import PageTitle from "~/components/PageTitle";
import TeamLogo from "~/components/TeamLogo";
import Text from "~/components/Text";
import env from "~/env";
import useQuery from "~/hooks/useQuery";
import useStores from "~/hooks/useStores";
import { isCustomDomain } from "~/utils/domains";
import { changeLanguage, detectLanguage } from "~/utils/language";
import Notices from "./Notices";
import Provider from "./Provider";

const isHosted = env.DEPLOYMENT === "hosted";

function Header({ config }: { config?: Config | undefined }) {
  const { t } = useTranslation();
  const isSubdomain = !!config?.hostname;

  if (!isHosted || isCustomDomain()) {
    return null;
  }

  if (isSubdomain) {
    return (
      <Back href={env.URL}>
        <BackIcon color="currentColor" /> {t("Back to home")}
      </Back>
    );
  }

  return (
    <Back href="https://www.getoutline.com">
      <BackIcon color="currentColor" /> {t("Back to website")}
    </Back>
  );
}

function Login() {
  const location = useLocation();
  const query = useQuery();
  const { t, i18n } = useTranslation();
  const { auth } = useStores();
  const { config } = auth;
  const [error, setError] = React.useState(null);
  const [emailLinkSentTo, setEmailLinkSentTo] = React.useState("");
  const isCreate = location.pathname === "/create";
  const handleReset = React.useCallback(() => {
    setEmailLinkSentTo("");
  }, []);
  const handleEmailSuccess = React.useCallback((email) => {
    setEmailLinkSentTo(email);
  }, []);

  React.useEffect(() => {
    auth.fetchConfig().catch(setError);
  }, [auth]);

  // TODO: Persist detected language to new user
  // Try to detect the user's language and show the login page on its idiom
  // if translation is available
  React.useEffect(() => {
    changeLanguage(detectLanguage(), i18n);
  }, [i18n]);

  React.useEffect(() => {
    const entries = Object.fromEntries(query.entries());

    // We don't want to override this cookie if we're viewing an error notice
    // sent back from the server via query string (notice=), or if there are no
    // query params at all.
    if (Object.keys(entries).length && !query.get("notice")) {
      setCookie("signupQueryParams", JSON.stringify(entries));
    }
  }, [query]);

  if (auth.authenticated && auth.team?.defaultCollectionId) {
    return <Redirect to={`/collection/${auth.team?.defaultCollectionId}`} />;
  }

  if (auth.authenticated) {
    return <Redirect to="/home" />;
  }

  if (error) {
    return (
      <Background>
        <Header />
        <Centered align="center" justify="center" column auto>
          <PageTitle title={t("Login")} />
          <NoticeAlert>
            {t("Failed to load configuration.")}
            {!isHosted && (
              <p>
                Check the network requests and server logs for full details of
                the error.
              </p>
            )}
          </NoticeAlert>
        </Centered>
      </Background>
    );
  }

  // we're counting on the config request being fast, so display nothing while waiting
  if (!config) {
    return null;
  }

  const hasMultipleProviders = config.providers.length > 1;
  const defaultProvider = find(
    config.providers,
    (provider) => provider.id === auth.lastSignedIn && !isCreate
  );

  if (emailLinkSentTo) {
    return (
      <Background>
        <Header config={config} />
        <Centered align="center" justify="center" column auto>
          <PageTitle title={t("Check your email")} />
          <CheckEmailIcon size={38} color="currentColor" />
          <Heading centered>{t("Check your email")}</Heading>
          <Note>
            <Trans
              defaults="A magic sign-in link has been sent to the email <em>{{ emailLinkSentTo }}</em>, no password needed."
              values={{
                emailLinkSentTo: emailLinkSentTo,
              }}
              components={{
                em: <em />,
              }}
            />
          </Note>
          <br />
          <ButtonLarge onClick={handleReset} fullwidth neutral>
            {t("Back to login")}
          </ButtonLarge>
        </Centered>
      </Background>
    );
  }

  return (
    <Background>
      <Header config={config} />
      <Centered align="center" justify="center" column auto>
        <PageTitle title={t("Login")} />
        <Logo>
          {env.TEAM_LOGO && env.DEPLOYMENT !== "hosted" ? (
            <TeamLogo src={env.TEAM_LOGO} />
          ) : (
            <OutlineLogo size={38} fill="currentColor" />
          )}
        </Logo>
        {isCreate ? (
          <>
            <Heading centered>{t("Create an account")}</Heading>
            <GetStarted>
              {t(
                "Get started by choosing a sign-in method for your new team below…"
              )}
            </GetStarted>
          </>
        ) : (
          <Heading centered>
            {t("Login to {{ authProviderName }}", {
              authProviderName: config.name || "Outline",
            })}
          </Heading>
        )}
        <Notices />
        {defaultProvider && (
          <React.Fragment key={defaultProvider.id}>
            <Provider
              isCreate={isCreate}
              onEmailSuccess={handleEmailSuccess}
              {...defaultProvider}
            />
            {hasMultipleProviders && (
              <>
                <Note>
                  {t("You signed in with {{ authProviderName }} last time.", {
                    authProviderName: defaultProvider.name,
                  })}
                </Note>
                <Or />
              </>
            )}
          </React.Fragment>
        )}
        {config.providers.map((provider: any) => {
          if (defaultProvider && provider.id === defaultProvider.id) {
            return null;
          }

          return (
            <Provider
              key={provider.id}
              isCreate={isCreate}
              onEmailSuccess={handleEmailSuccess}
              {...provider}
            />
          );
        })}
        {isCreate && (
          <Note>
            <Trans>
              Already have an account? Go to <Link to="/">login</Link>.
            </Trans>
          </Note>
        )}
      </Centered>
    </Background>
  );
}

const CheckEmailIcon = styled(EmailIcon)`
  margin-bottom: -1.5em;
`;

const Background = styled(Fade)`
  width: 100vw;
  height: 100vh;
  background: ${(props) => props.theme.background};
  display: flex;
`;

const Logo = styled.div`
  margin-bottom: -1.5em;
  height: 38px;
`;

const GetStarted = styled(Text)`
  text-align: center;
  margin-top: -12px;
`;

const Note = styled(Text)`
  text-align: center;
  font-size: 14px;

  em {
    font-style: normal;
    font-weight: 500;
  }
`;

const Back = styled.a`
  display: flex;
  align-items: center;
  color: inherit;
  padding: 32px;
  font-weight: 500;
  position: absolute;

  svg {
    transition: transform 100ms ease-in-out;
  }

  &:hover {
    svg {
      transform: translateX(-4px);
    }
  }
`;

const Or = styled.hr`
  margin: 1em 0;
  position: relative;
  width: 100%;

  &:after {
    content: "Or";
    display: block;
    position: absolute;
    left: 50%;
    transform: translate3d(-50%, -50%, 0);
    text-transform: uppercase;
    font-size: 11px;
    color: ${(props) => props.theme.textSecondary};
    background: ${(props) => props.theme.background};
    border-radius: 2px;
    padding: 0 4px;
  }
`;

const Centered = styled(Flex)`
  user-select: none;
  width: 90vw;
  height: 100%;
  max-width: 320px;
  margin: 0 auto;
`;

export default observer(Login);
