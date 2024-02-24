utools.onPluginEnter(({
	code,
	type,
	payload,
	option
}) => {
	if (code == 'addCommand') {
		let data = JSON.parse(payload);
		utools.setFeature(data)
		addSystemMessage(payload + " 指令添加成功");
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
	connection();
	let terminal = terminals[terminals.length - 1];
	terminal.onopen = function(e) {
		if (message && message != 'terminal') {
			addSystemMessage(message);
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
		console.log('插件应用隐藏后台')
	}
});