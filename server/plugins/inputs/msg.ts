import {PluginInputHandler} from "./index";
import Msg from "../../models/msg";
import Chan from "../../models/chan";
import {MessageType} from "../../../shared/types/msg";
import {ChanType} from "../../../shared/types/chan";
import {isValidMsgid} from "../../../shared/beeTags";

const commands = ["query", "msg", "say"];

function getTarget(cmd: string, args: string[], chan: Chan) {
	switch (cmd) {
		case "msg":
		case "query":
			return args.shift();
		default:
			return chan.name;
	}
}

const input: PluginInputHandler = function (network, chan, cmd, args, opts) {
	let targetName = getTarget(cmd, args, chan);

	if (cmd === "query") {
		if (!targetName) {
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.ERROR,
					text: "You cannot open a query window without an argument.",
				})
			);
			return;
		}

		const target = network.getChannel(targetName);

		if (typeof target === "undefined") {
			const char = targetName[0];

			if (
				network.irc.network.options.CHANTYPES &&
				network.irc.network.options.CHANTYPES.includes(char)
			) {
				chan.pushMessage(
					this,
					new Msg({
						type: MessageType.ERROR,
						text: "You can not open query windows for channels, use /join instead.",
					})
				);
				return;
			}

			for (let i = 0; i < network.irc.network.options.PREFIX.length; i++) {
				if (network.irc.network.options.PREFIX[i].symbol === char) {
					chan.pushMessage(
						this,
						new Msg({
							type: MessageType.ERROR,
							text: "You can not open query windows for names starting with a user prefix.",
						})
					);
					return;
				}
			}

			const newChan = this.createChannel({
				type: ChanType.QUERY,
				name: targetName,
			});

			this.emit("join", {
				network: network.uuid,
				chan: newChan.getFilteredClone(true),
				shouldOpen: true,
				index: network.addChannel(newChan),
			});
			this.save();
			newChan.loadMessages(this, network);
		}
	}

	if (args.length === 0) {
		return true;
	}

	if (!targetName) {
		return true;
	}

	const msg = args.join(" ");

	if (msg.length === 0) {
		return true;
	}

	// BeeRoom reply: only plain "say" lines get here with replyTo (validated in Client.input)
	const tags: Record<string, string> = {};

	if (
		cmd === "say" &&
		opts?.replyTo &&
		isValidMsgid(opts.replyTo) &&
		network.irc.network.cap.isEnabled("message-tags")
	) {
		tags["+draft/reply"] = opts.replyTo;
	}

	network.irc.say(targetName, msg, tags);

	// If the IRCd does not support echo-message, simulate the message
	// being sent back to us.
	if (!network.irc.network.cap.isEnabled("echo-message")) {
		const parsedTarget = network.irc.network.extractTargetGroup(targetName);
		let targetGroup: string | undefined = undefined;

		if (parsedTarget) {
			targetName = parsedTarget.target;
			targetGroup = parsedTarget.target_group;
		}

		const channel = network.getChannel(targetName);

		if (typeof channel !== "undefined") {
			network.irc.emit("privmsg", {
				nick: network.irc.user.nick,
				ident: network.irc.user.username,
				hostname: network.irc.user.host,
				target: targetName,
				group: targetGroup,
				message: msg,
				tags,
			});
		}
	}

	return true;
};

export default {
	commands,
	input,
};
