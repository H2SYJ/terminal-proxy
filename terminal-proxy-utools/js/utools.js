utools.onPluginEnter(({
	code,
	type,
	payload,
	option
}) => {
	if (code == 'addCommand') {
		let data = JSON.parse(payload);
		utools.setFeature(data)
		debug(payload + " 指令添加成功");
		return;
	}
	let message = payload;
	let features = utools.getFeatures([code]);
	if (features && features.length > 0) {
		if (type == 'regex')
			message = features[0].explain + " " + payload;
		else if (type == 'text' && code != 'terminal')
			message = features[0].explain;
	}
	let terminalId = connection();
	let terminal = terminals.get(terminalId);
	debug(`[execute] ${terminalId}: ${message}`)
	terminal.onopen = function(e) {
		if (message && message != 'terminal') {
			terminal.send(message);
		}
	}
});

utools.onPluginOut((processExit) => {
	if (processExit) {
		// 完全退出
		terminals.forEach(function(terminal) {
			terminal.close();
		});
	} else {
		debug('插件应用隐藏后台');
	}
});