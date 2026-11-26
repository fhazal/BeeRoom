import socket from "../socket";
import {store} from "../store";

// BeeRoom: the server sends the full reaction list of one message
socket.on("msg:react", function (data) {
	const netChan = store.getters.findChannel(data.chan);
	const message = netChan?.channel.messages.find((m) => m.id === data.id);

	if (!message || !Array.isArray(data.reactions)) {
		return;
	}

	message.reactions = data.reactions;
});
