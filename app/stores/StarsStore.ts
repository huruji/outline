import invariant from "invariant";
import { action, runInAction, computed } from "mobx";
import Star from "~/models/Star";
import { PaginationParams } from "~/types";
import { client } from "~/utils/ApiClient";
import BaseStore from "./BaseStore";
import RootStore from "./RootStore";

export default class StarsStore extends BaseStore<Star> {
  constructor(rootStore: RootStore) {
    super(rootStore, Star);
  }

  @action
  fetchPage = async (params?: PaginationParams | undefined): Promise<void> => {
    this.isFetching = true;

    try {
      const res = await client.post(`/stars.list`, params);
      invariant(res && res.data, "Data not available");
      runInAction(`StarsStore#fetchPage`, () => {
        res.data.documents.forEach(this.rootStore.documents.add);
        res.data.stars.forEach(this.add);
        this.addPolicies(res.policies);
        this.isLoaded = true;
      });
    } finally {
      this.isFetching = false;
    }
  };

  @computed
  get orderedData(): Star[] {
    const stars = Array.from(this.data.values());

    return stars.sort((a, b) => {
      if (a.index === b.index) {
        return a.updatedAt > b.updatedAt ? -1 : 1;
      }

      return a.index < b.index ? -1 : 1;
    });
  }
}
