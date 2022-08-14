import { Snowflake } from "discord.js";
import R6API from "r6api.js";

import { Base } from "./Base";
import { R6MemberSettingsTable } from "./tables/R6MemberSettings";

const r6api = new R6API({ email: Base.config.r6API.ubisoftEmail, password: Base.config.r6API.ubisoftPassword });

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
      const currentSeasonData = rawRank.seasons[lastSeasonNumber].regions?.emea?.boards?.pvp_ranked?.current;
      if (!currentSeasonData) {
        console.error("unable to lookup rank");
      }
      return {
        mmr: currentSeasonData.mmr,
        unranked: currentSeasonData.name === "Unranked",
      };
    });

    return ranks;
  }
  static async lookupSingleRank(ubisoftId: string): Promise<Rank | undefined> {
    const { 0: rank } = await R6ApiUtils.lookupRank([ubisoftId]);
    return rank;
  }

  static async tryUpdateRank(guildId: Snowflake, memberId: Snowflake) {
    try {
      const r6config = await R6MemberSettingsTable.get(guildId, memberId);

      if (!r6config) {
        console.log("err", "lookupSingleRank1");

        return;
      }

      const rank = await R6ApiUtils.lookupSingleRank(r6config.ubisoft_user_id);
      if (!rank) {
        console.log("err", "lookupSingleRank2");
        return;
      }
      await R6MemberSettingsTable.updateRank(guildId, memberId, rank.mmr, rank.unranked);
      console.log("updated", r6config, rank);
    } catch (e) {
      console.error("unable to update rank", e);
    }
  }
}
