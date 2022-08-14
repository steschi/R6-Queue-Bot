import { Collection, Guild, GuildMember, Snowflake } from "discord.js";

import { Base } from "../Base";
import { R6MemberSetting } from "../Interfaces";

export class R6MemberSettingsTable {
  // Create & update database table if necessary
  public static async initTable() {
    await Base.knex.schema.hasTable("r6_member_settings").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("r6_member_settings", (table) => {
            table.increments("id").primary();
            table.bigInteger("guild_id");
            table.bigInteger("member_id");
            table.string("ubisoft_username");
            table.string("ubisoft_user_id");
            table.integer("cached_mmr").nullable();
            table.boolean("cached_unranked").nullable();
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static get(guildId: Snowflake, memberId: Snowflake) {
    return Base.knex<R6MemberSetting>("r6_member_settings").where("guild_id", guildId).where("member_id", memberId).first();
  }

  public static getMany(guildId: Snowflake) {
    return Base.knex<R6MemberSetting>("r6_member_settings").where("guild_id", guildId);
  }

  public static getManyForMemberIds(guildId: Snowflake, memberIds: Snowflake[]) {
    return Base.knex<R6MemberSetting>("r6_member_settings").where("guild_id", guildId).whereIn("member_id", memberIds);
  }

  public static async updateRank(guildId: Snowflake, memberId: Snowflake, cachedMMR: number | null, cachedUnranked: boolean | null) {
    await Base.knex<R6MemberSetting>("r6_member_settings").where("guild_id", guildId).where("member_id", memberId).update({
      cached_mmr: cachedMMR,
      cached_unranked: cachedUnranked,
    });
  }

  public static async store(guildId: Snowflake, memberId: Snowflake, ubisoftUsername: string, ubisoftUserId: string) {
    const existingEntry = await R6MemberSettingsTable.get(guildId, memberId);

    if (existingEntry) {
      await Base.knex<R6MemberSetting>("r6_member_settings").where("id", existingEntry.id).update({
        guild_id: guildId,
        member_id: memberId,
        ubisoft_username: ubisoftUsername,
        ubisoft_user_id: ubisoftUserId,
      });
    } else {
      await Base.knex<R6MemberSetting>("priority").insert({
        guild_id: guildId,
        member_id: memberId,
        ubisoft_username: ubisoftUsername,
        ubisoft_user_id: ubisoftUserId,
      });
    }
  }

  public static async unstore(guildId: Snowflake, memberId?: Snowflake) {
    let query = Base.knex<R6MemberSetting>("r6_member_settings").where("guild_id", guildId);
    if (memberId) {
      query = query.where("member_id", memberId);
    }
    await query.delete();
  }

  public static async validate(guild: Guild, members: Collection<Snowflake, GuildMember>): Promise<boolean> {
    let updateRequired = false;
    const storedEntries = await R6MemberSettingsTable.getMany(guild.id);
    for await (const entry of storedEntries) {
      const member = members.find((m) => m.id === entry.member_id);
      if (!member) {
        await R6MemberSettingsTable.unstore(guild.id, entry.member_id);
        updateRequired = true;
      }
    }
    return updateRequired;
  }
}
