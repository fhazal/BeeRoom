<template>
	<NetworkForm :handle-submit="handleSubmit" :defaults="defaults" :disabled="disabled" />
</template>

<script lang="ts">
import {defineComponent, onMounted, ref} from "vue";

import socket from "../../js/socket";
import {useStore} from "../../js/store";
import NetworkForm, {NetworkFormDefaults} from "../NetworkForm.vue";

export default defineComponent({
	name: "Connect",
	components: {
		NetworkForm,
	},
	props: {
		queryParams: Object,
	},
	setup(props) {
		const store = useStore();

		const disabled = ref(false);

		const handleSubmit = (data: Record<string, any>) => {
			disabled.value = true;
			socket.emit("network:new", data);
		};

		const parseOverrideParams = (params?: Record<string, string>) => {
			if (!params) {
				return {};
			}

			const parsedParams: Record<string, any> = {};

			for (let key of Object.keys(params)) {
				let value = params[key];

				// Param can contain multiple values in an array if its supplied more than once
				if (Array.isArray(value)) {
					value = value[0];
				}

				// Support `channels` as a compatibility alias with other clients
				if (key === "channels") {
					key = "join";
				}

				if (
					!Object.prototype.hasOwnProperty.call(
						store.state.serverConfiguration?.defaults,
						key
					)
				) {
					continue;
				}

				// When the network is locked, URL overrides should not affect disabled fields
				if (
					store.state.serverConfiguration?.lockNetwork &&
					["name", "host", "port", "tls", "rejectUnauthorized"].includes(key)
				) {
					continue;
				}

				// BeeRoom: with lockChannels the server joins the set room anyway,
				// so a link's room must not show up in the form either
				if (
					key === "join" &&
					store.state.serverConfiguration?.public &&
					store.state.serverConfiguration?.lockNetwork &&
					store.state.serverConfiguration?.lockChannels
				) {
					continue;
				}

				if (key === "join") {
					value = value
						.split(",")
						.map((chan) => {
							if (!chan.match(/^[#&!+]/)) {
								return `#${chan}`;
							}

							return chan;
						})
						.join(", ");
				}

				// Override server provided defaults with parameters passed in the URL if they match the data type
				switch (typeof store.state.serverConfiguration?.defaults[key]) {
					case "boolean":
						if (value === "0" || value === "false") {
							parsedParams[key] = false;
						} else {
							parsedParams[key] = !!value;
						}

						break;
					case "number":
						parsedParams[key] = Number(value);
						break;
					case "string":
						parsedParams[key] = String(value);
						break;
				}
			}

			return parsedParams;
		};

		const defaults = ref<Partial<NetworkFormDefaults>>(
			Object.assign(
				{},
				store.state.serverConfiguration?.defaults,
				parseOverrideParams(props.queryParams)
			)
		);

		// BeeRoom: the Hive Panel's Chat tab opens BeeRoom with ?autoconnect
		// and a one-time SASL key. Connect at once, and take the key out of
		// the address so it isn't kept in the history.
		if (props.queryParams?.autoconnect !== undefined) {
			// Hash routing keeps the query after "#/connect": drop all of it.
			window.history.replaceState(
				window.history.state,
				"",
				window.location.pathname + "#/connect"
			);
			onMounted(() => handleSubmit({...defaults.value}));
		}

		return {
			defaults,
			disabled,
			handleSubmit,
		};
	},
});
</script>
