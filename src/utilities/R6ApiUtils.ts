import R6API from "r6api.js";

import { Base } from "./Base";

const r6api = new R6API({ email: Base.config.r6API.ubisoftUsername, password: Base.config.r6API.ubisoftPassword });

export type Rank = {
  mmr: number;
  unranked: boolean;
};

export class R6ApiUtils {
  static async lookupUbisoftId(username: string): Promise<string | undefined> {
    try {
      const { 0: player } = await r6api.findByUsername("uplay", username);
      return player?.id ?? undefined;
    } catch (e) {
      console.log(`Unable to resolve ubisoft id for "${username}"`, e);
    }
    return undefined;
  }

  static async lookupRank(ubisoftIds: string[]): Promise<(Rank | undefined)[]> {
    const rawRanks = await r6api.getRanks("uplay", ubisoftIds, { regionIds: "emea", boardIds: "pvp_ranked", seasonIds: [-1] });

    const ranks = rawRanks.map((rawRank): Rank | undefined => {
      if (!rawRank) {
        return undefined;
      }
      const sortedSeasonNumbers = Object.keys(rawRank.seasons)
        .map((v) => parseInt(v))
        .sort();
      const lastSeasonNumber = sortedSeasonNumbers[sortedSeasonNumbers.length - 1];
      const currentSeasonData = rawRank.seasons[lastSeasonNumber].regions.emea.boards.pvp_ranked;
      return {
        mmr: currentSeasonData.mmr,
        unranked: currentSeasonData.name === "Unranked",
      };
    });

    return ranks;
  }
  static async lookupSingleRank(ubisoftIds: string): Promise<Rank | undefined> {
    const { 0: rank } = await R6ApiUtils.lookupRank([ubisoftIds]);
    return rank;
  }
}
