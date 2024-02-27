const terminalProxyHost = 'ws://127.0.0.1:2330/terminal';
let history = []; // 输入的历史记录
let historyCursor = -1; // 历史记录游标
let terminals = new Map(); // 终端集合 key: terminalId, value: Socket
let curTerminalId; // 当前终端Id
let curTerminal; // 当前终端的Socket
let lastMessageMap = new Map(); // 最新消息集合 key: terminalId, value: { terminalId, lastTime, lastMessage, lastMessageId }

function send(msg) {
	history.push(msg);
	historyCursor = history.length;

	try {
		curTerminal.send(msg);
	} catch (e) {
		addSystemMessage(curTerminalId, e);
		console.log(e);
	}

	let item = document.createElement('div');
	item.className = 'item item-right';
	item.innerHTML =
		`<div class="bubble bubble-right">${msg}</div><div class="avatar"><img src="img/user.png" /></div>`;
	document.querySelector(`#${curTerminalId}`).appendChild(item);
	document.querySelector('#textarea').value = '';
	document.querySelector('#textarea').focus();
	updateTerminalList(curTerminalId, msg);
	scrollTopToEnd(curTerminalId);
}

function connection() {
	const terminalId = "terminal-" + generateUUID();
	// 添加一个消息容器到主界面
	let content = document.createElement('div');
	content.className = 'content';
	content.id = terminalId;
	content.style.display = 'block';
	let inputArea = document.querySelector('.input-area');
	document.querySelectorAll('.container .content').forEach(page => {
		page.style.display = 'none';
	});
	document.querySelector('.container').insertBefore(content, inputArea);
	// 添加到侧边栏显示
	let changeLi = document.createElement('li');
	changeLi.innerHTML = `
	<div>
		<span>${terminalId.substring(terminalId.length - 6, terminalId.length)}</span>
		<i>${getCurrentTime()}</i>
	</div>
	<div></div>`;
	changeLi.setAttribute('data-target', terminalId);
	changeLi.addEventListener('click', (e) => {
		e.preventDefault();
		document.querySelectorAll('.container .content').forEach(item => {
			item.style.display = 'none';
		});
		document.getElementById(terminalId).style.display = 'block';
		curTerminalId = terminalId;
		curTerminal = terminals.get(terminalId);
		refreshTermianlListState();
	});
	let close = document.createElement('a');
	close.href = '#';
	close.innerText = '✕';
	close.className = 'close';
	close.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		closeTerminal(terminalId);
	});
	changeLi.appendChild(close);
	document.querySelector('.terminal-list').appendChild(changeLi);

	let socket = new WebSocket(terminalProxyHost);
	socket.onopen = function (e) {
		addSystemMessage(terminalId, '开始连接');
	};
	socket.addEventListener("message", function (e) {
		reviceMessage(terminalId, e.data)
	});
	terminals.set(terminalId, socket);
	curTerminalId = terminalId;
	curTerminal = socket;
	refreshTermianlListState();
	return terminalId;
}

function reviceMessage(terminalId, msg) {
	let curTime = new Date().getTime();
	let lastMessage = lastMessageMap.get(terminalId);
	if (lastMessage && curTime - lastMessage.lastTime < 1000) {
		document.querySelector(`#msg-${lastMessage.lastMessage}`).innerHTML += "</br>" + msg;
	} else {
		let lastMessageId = generateUUID();
		lastMessageMap.set(terminalId, { terminalId: terminalId, lastTime: curTime, lastMessage: msg, lastMessageId: lastMessageId });
		let item = document.createElement('div');
		item.className = 'item item-left';
		item.innerHTML =
			`<div class="avatar"><img src="img/terminal.png" /></div><div class="bubble bubble-left" id="msg-${lastMessageId}">${msg}</div>`;
		document.querySelector(`#${terminalId}`).appendChild(item);
	}
	updateTerminalList(terminalId, msg);
	scrollTopToEnd(terminalId);
}

function addSystemMessage(terminalId, msg) {
	let item = document.createElement('div');
	item.className = 'item item-center';
	item.innerHTML = `<span>${msg}</span>`;
	document.querySelector(`#${terminalId}`).appendChild(item);
	updateTerminalList(terminalId, msg);
}

function closeTerminal(terminalId) {
	let terminal = terminals.get(terminalId);
	if (terminal && terminal.readyState == WebSocket.OPEN) {
		debug(`[close] ${terminalId}`);
		terminal.close();
	}
	terminals.delete(terminalId);
	lastMessageMap.delete(terminalId);
	document.querySelector('.terminal-list').removeChild(document.querySelector(`.terminal-list>li[data-target='${terminalId}']`));
	document.querySelector('.container').removeChild(document.querySelector(`#${terminalId}`));
	if (curTerminal == terminal) {
		curTerminal = '';
		curTerminalId = '';
		document.querySelector('li[data-target="debug"]').click();
	}
}

function refreshTermianlListState() {
	document.querySelectorAll('.terminal-list li').forEach(item => {
		item.className = '';
	});
	document.querySelector(`.terminal-list li[data-target='${curTerminalId}']`).className = 'active';
}

function updateTerminalList(terminalId, msg) {
	document.querySelector(`.terminal-list>li[data-target='${terminalId}'] i`).innerHTML = getCurrentTime();
	document.querySelector(`.terminal-list>li[data-target='${terminalId}'] div:last-of-type`).innerHTML = msg;
}

function keyDown(input) {
	var keycode = event.keyCode;
	if (keycode == 13) { //回车键是13 
		let msg = document.querySelector('#textarea').value;
		if (!msg) {
			alert('请输入内容');
			return;
		}
		send(msg);
		event.preventDefault();
	} else if (keycode == 38) { // 上键
		if (historyCursor <= 0 || history.length == 0)
			return;
		historyCursor--;
		input.value = history[historyCursor];
	} else if (keycode == 40) { // 下键
		if (historyCursor >= history.length - 1 || history.length == 0)
			return;
		historyCursor++;
		input.value = history[historyCursor];
	}
}

function scrollTopToEnd(terminalId) {
	//滚动条置底
	let height = document.querySelector(`#${terminalId}`).scrollHeight;
	document.querySelector(`#${terminalId}`).scrollTop = height;
}

function generateUUID() {
	let dt = new Date().getTime();
	let uuid = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		let r = (dt + Math.random() * 16) % 16 | 0;
		dt = Math.floor(dt / 16);
		return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
	});
	return uuid;
}

function getCurrentTime() {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

function debug(msg) {
	let item = document.createElement('div');
	item.className = 'item item-left';
	item.innerHTML =
		`<div class="avatar"><img src="img/terminal.png" /></div><div class="bubble bubble-left">${msg}</div>`;
	document.querySelector('#debug').appendChild(item);
	updateTerminalList('debug', msg);
	scrollTopToEnd('debug');
}
