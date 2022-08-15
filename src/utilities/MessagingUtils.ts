import {
  ColorResolvable,
  DiscordAPIError,
  EmbedFieldData,
  GuildBasedChannel,
  GuildEmoji,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  TextBasedChannel,
  TextChannel,
} from "discord.js";

import { Base } from "./Base";
import { QueueUpdateRequest, StoredGuild } from "./Interfaces";
import { SchedulingUtils } from "./SchedulingUtils";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import { QueueTable } from "./tables/QueueTable";
import { R6MemberSettingsTable } from "./tables/R6MemberSettings";
import { Validator } from "./Validator";

// Rank: n1 <= X < n2 -> emoji name
const MmrToRankMapping: [number, number, string][] = [
  [0, 1600, "copper1"],
  [1600, 1700, "bronze5"],
  [1700, 1800, "bronze4"],
  [1800, 1900, "bronze3"],
  [1900, 2000, "bronze2"],
  [2000, 2100, "bronze1"],
  [2100, 2200, "silver5"],
  [2200, 2300, "silver4"],
  [2300, 2400, "silver3"],
  [2400, 2500, "silver2"],
  [2500, 2600, "silver1"],
  [2600, 2800, "gold3"],
  [2800, 3000, "gold2"],
  [3000, 3200, "gold1"],
  [3200, 3500, "platinum3"],
  [3500, 3800, "platinum2"],
  [3800, 4100, "platinum1"],
  [4100, 4400, "diamond3"],
  [4400, 4700, "diamond2"],
  [4700, 5000, "diamond1"],
  [5000, Number.POSITIVE_INFINITY, "champions"],
];

function getEmojiNameForMMR(mmr: number | null, unranked: boolean): string {
  if (unranked || mmr === null) {
    return "unranked";
  }
  for (const range of MmrToRankMapping) {
    if (range[0] <= mmr && mmr < range[1]) {
      return range[2];
    }
  }
  return "unranked";
}

export class MessagingUtils {
  private static gracePeriodCache = new Map<number, string>();

  public static async updateDisplay(request: QueueUpdateRequest) {
    const storedGuild = request.storedGuild;
    const queueChannel = request.queueChannel;
    const storedDisplays = await DisplayChannelTable.getFromQueue(queueChannel.id);
    if (!storedDisplays || storedDisplays.length === 0) {
      return;
    }

    // Create an embed list
    const embeds = await this.generateEmbed(queueChannel);
    for await (const storedDisplay of storedDisplays) {
      // For each embed list of the queue
      try {
        const displayChannel = (await Base.client.channels.fetch(storedDisplay.display_channel_id).catch(async (e) => {
          if ([403, 404].includes(e.httpStatus)) {
            // Handled deleted display channels
            await DisplayChannelTable.unstore(queueChannel.id, storedDisplay.display_channel_id);
          }
        })) as TextChannel;
        const message = await displayChannel?.messages?.fetch(storedDisplay.message_id).catch(() => null as Message);
        const perms = displayChannel?.permissionsFor(displayChannel.guild.me);
        if (displayChannel && message && perms?.has("SEND_MESSAGES") && perms?.has("EMBED_LINKS")) {
          // Retrieved display embed
          if (storedGuild.msg_mode === 1) {
            /* Edit */
            await message
              .edit({
                embeds: embeds,
                components: await MessagingUtils.getButton(queueChannel),
                allowedMentions: { users: [] },
              })
              .catch(() => null);
          } else {
            /* Replace */
            await DisplayChannelTable.unstore(queueChannel.id, displayChannel.id, storedGuild.msg_mode !== 3);
            await DisplayChannelTable.store(queueChannel, displayChannel, embeds);
          }
        }
      } catch (e: any) {
        console.error(e);
      }
    }
    // setTimeout(() => Validator.validateGuild(queueChannel.guild).catch(() => null), 1000);
    Validator.validateGuild(queueChannel.guild).catch(() => null);
  }

  /**
   * Return a grace period in string form
   * @param gracePeriod Guild id.
   */
  public static getGracePeriodString(gracePeriod: number): string {
    if (!this.gracePeriodCache.has(gracePeriod)) {
      let result;
      if (gracePeriod) {
        const graceMinutes = Math.floor(gracePeriod / 60);
        const graceSeconds = gracePeriod % 60;
        result =
          (graceMinutes > 0 ? graceMinutes + " minute" : "") +
          (graceMinutes > 1 ? "s" : "") +
          (graceMinutes > 0 && graceSeconds > 0 ? " and " : "") +
          (graceSeconds > 0 ? graceSeconds + " second" : "") +
          (graceSeconds > 1 ? "s" : "");
      } else {
        result = "";
      }
      this.gracePeriodCache.set(gracePeriod, result);
    }
    return this.gracePeriodCache.get(gracePeriod);
  }

  private static getTimestampFormat(storedGuild: StoredGuild): string {
    switch (storedGuild.timestamps) {
      case "time":
        return "t";
      case "date":
        return "D";
      case "date+time":
        return "f";
      case "relative":
        return "R";
      default:
        return "off";
    }
  }

  /**
   *
   * @param queueChannel Discord message object.
   */
  public static async generateEmbed(queueChannel: GuildBasedChannel): Promise<MessageEmbed[]> {
    const storedGuild = await QueueGuildTable.get(queueChannel.guild.id);
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (!storedQueue) {
      return [];
    }
    let queueMembers = await QueueMemberTable.getFromQueueOrdered(queueChannel);
    const emojis: Record<string, GuildEmoji> = {};
    queueChannel.guild.client.emojis.cache.forEach((emj) => {
      emojis[emj.name] = emj;
    });

    // Title
    let title = `${storedQueue.is_locked ? "🔒 " : ""}${queueChannel.name}`;
    if (storedQueue.target_channel_id) {
      const targetChannel = queueChannel.guild.channels.cache.get(storedQueue.target_channel_id);
      if (targetChannel) {
        title += `  ->  ${targetChannel.name}`;
      } else {
        // Target has been deleted - clean it up
        await QueueTable.setTarget(queueChannel.id, Base.knex.raw("DEFAULT"));
      }
    }
    // Description
    let description: string;
    if (storedQueue.is_locked) {
      description = "Queue is locked.";
    } else {
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
        description = `Join ${queueChannel} to join this queue.`;
      } else {
        description = `To interact, click the button or use \`/join\` & \`/leave\`.`;
      }
    }
    const timeString = this.getGracePeriodString(storedQueue.grace_period);
    if (timeString) {
      description += `\nIf you leave, you have **${timeString}** to rejoin to reclaim your spot.`;
    }
    description += await SchedulingUtils.getSchedulesString(queueChannel.id);
    if (queueMembers.some((member) => member.is_priority)) {
      description += `\nPriority users are marked with a ⋆.`;
    }

    // Create a list of entries
    let position = 0;
    const entries: string[] = [];
    let ranks: number[] = [];
    let queueHasMembersWithoutUbisoftname = false;
    for await (const queueMember of queueMembers) {
      let member: GuildMember;
      if (storedGuild.disable_mentions) {
        member = await queueChannel.guild.members.fetch(queueMember.member_id).catch(async (e: DiscordAPIError) => {
          if ([403, 404].includes(e.httpStatus)) {
            await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id, [queueMember.member_id]);
          }
          return null;
        });
        if (!member) {
          continue;
        }
      }
      // Create entry string
      const idxStr = "`" + (++position < 10 ? position + " " : position) + "` ";
      const timeStr =
        storedGuild.timestamps === "off"
          ? ""
          : `<t:${Math.floor(queueMember.display_time.getTime() / 1000)}:${this.getTimestampFormat(storedGuild)}> `;
      const prioStr = `${queueMember.is_priority ? "⋆" : ""}`;

      let rankStr = "";

      try {
        const r6Rank = await R6MemberSettingsTable.get(queueChannel.guild.id, queueMember.member_id);

        if (!r6Rank || !r6Rank.ubisoft_username || !r6Rank.cached_mmr) {
          queueHasMembersWithoutUbisoftname = true;
        }

        if (r6Rank) {
          const emojiName = getEmojiNameForMMR(r6Rank.cached_mmr, r6Rank.cached_unranked);
          const emoji = emojis[emojiName];
          if (emoji) {
            rankStr = `${emoji}  `;
          }

          if (r6Rank.cached_mmr) {
            rankStr += `\`${r6Rank.cached_mmr}\`  `;
          }

          if (!r6Rank.cached_unranked) {
            ranks.push(r6Rank.cached_mmr);
          }
        }
      } catch (e) {
        console.error("unable to add rank to display", e);
      }

      const nameStr =
        storedGuild.disable_mentions && member?.displayName
          ? `\`${member.displayName}#${member?.user?.discriminator}\``
          : `<@${queueMember.member_id}>`;
      const msgStr = queueMember.personal_message ? " -- " + queueMember.personal_message : "";

      entries.push(idxStr + timeStr + prioStr + rankStr + nameStr + msgStr + "\n");
    }

    let firstFieldName = storedQueue.max_members ? `Capacity:  ${position} / ${storedQueue.max_members}` : `Length:  ${position}`;

    if (ranks.length > 0) {
      const max = Math.max(...ranks);
      const min = Math.min(...ranks);
      const diff = Math.abs(max - min);
      if (diff > 0) {
        firstFieldName += `, Max MMR Difference: ${diff}`;
      }
    }

    if (queueHasMembersWithoutUbisoftname) {
      description += `\nIf your R6 rank is not shown use \`/ubisoftname set <your-ubisoft-name>\`.`;
    }
    if (storedQueue.header) {
      description += `\n\n${storedQueue.header}`;
    }
    const embeds: MessageEmbed[] = [];
    let embedLength = title.length + description.length + firstFieldName.length;
    let fields: EmbedFieldData[] = [];
    let field: EmbedFieldData = { name: "\u200b", value: "", inline: true };

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (embedLength + entry.length >= 6000) {
        // New Message Needed - TODO support multiple messages?
        break;
      }
      if (field.value.length + entry.length >= 1024) {
        fields.push(field);
        field = { name: "\u200b", value: "", inline: true };
        embedLength += 1;
      }
      field.value += entry;
      embedLength += entry.length;
    }
    // Add the remaining fields to embeds
    if (!field.value) {
      field.value = "\u200b";
    }
    fields.push(field);
    const embed = new MessageEmbed();
    embed.setTitle(title);
    embed.setColor(storedQueue.color);
    embed.setDescription(description);
    embed.setFields(fields);
    embed.fields[0].name = firstFieldName;
    embeds.push(embed);

    return embeds;
  }

  private static button: MessageActionRow[] = [
    new MessageActionRow().addComponents(new MessageButton().setCustomId("joinLeave").setLabel("Join / Leave").setStyle("SECONDARY")),
  ];

  public static async getButton(channel: GuildBasedChannel): Promise<MessageActionRow[]> {
    const storedQueue = await QueueTable.get(channel.id);
    if (!["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type) && !storedQueue?.hide_button) {
      return this.button;
    } else {
      return [];
    }
  }

  public static async logToLoggingChannel(
    command: string,
    content: string,
    author: GuildMember,
    storedGuild: StoredGuild,
    isEphemeral: boolean
  ): Promise<void> {
    const loggingChannelId = storedGuild.logging_channel_id;
    const loggingChannelLevel = storedGuild.logging_channel_level;
    if (loggingChannelId && (!isEphemeral || loggingChannelLevel === 1)) {
      const loggingChannel = (await author.guild.channels.fetch(loggingChannelId)) as TextBasedChannel;
      await loggingChannel
        .send({
          allowedMentions: { users: [] },
          embeds: [
            {
              fields: [
                {
                  name: command,
                  value: content,
                },
              ],
              author: {
                name: author.user.tag,
                icon_url: author.displayAvatarURL(),
              },
              footer: {
                icon_url: author.guild.me.displayAvatarURL(),
                text: `${author.guild.me.displayName}`,
              },
              timestamp: Date.now(),
              color: this.getLoggingColor(command),
            },
          ],
        })
        .catch(() => null);
    }
  }

  private static getLoggingColor(command: string): ColorResolvable {
    // TODO - return red for errors
    switch (command) {
      case "enqueue":
      case "join":
        return "GREEN";
      case "next":
      case "dequeue":
      case "leave":
        return "ORANGE";
      default:
        return "DARKER_GREY";
    }
  }
}
