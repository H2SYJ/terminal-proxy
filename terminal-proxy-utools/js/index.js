const terminalProxyHost = 'ws://192.168.3.33:2330/terminal';
let history = [];
let historyCursor = -1;
let terminals = new Map();
let curTerminalId;
let curTerminal;
let lastMessageTime = -1;
let lastMessageId = '';

function send() {
	let msg = document.querySelector('#textarea').value;
	if (!msg) {
		alert('请输入内容');
		return;
	}
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
	scrollTopToEnd(curTerminalId);
}

function connection() {
	let terminalId = "terminal-" + generateUUID();
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
	let changeBtn = document.createElement('a');
	changeBtn.href = '#';
	changeBtn.innerHTML = `<span>${terminalId.substring(terminalId.length - 6, terminalId.length)}</span>`;
	changeBtn.setAttribute('data-target', terminalId);
	changeBtn.addEventListener('click', (e) => {
		e.preventDefault();
		document.querySelectorAll('.container .content').forEach(page => {
			page.style.display = 'none';
		});
		document.getElementById(terminalId).style.display = 'block';
		curTerminalId = terminalId;
		curTerminal = terminals.get(terminalId);
	});
	document.querySelector('.sidebar').appendChild(changeBtn);

	let socket = new WebSocket(terminalProxyHost);
	socket.onopen = function (e) {
		addSystemMessage(terminalId, '开始连接');
	};
	socket.addEventListener("message", function (e) {
		reviceMessage(terminalId, e.data)
	});
	terminals.set(terminalId, socket);
	if (!curTerminalId)
		curTerminalId = terminalId;
	if (!curTerminal)
		curTerminal = socket;
}

function reviceMessage(terminalId, msg) {
	let curTime = new Date().getTime();
	if (curTime - lastMessageTime < 1000) {
		document.querySelector(`#msg-${lastMessageId}`).innerHTML += "</br>" + msg;
	} else {
		lastMessageId = generateUUID();
		let item = document.createElement('div');
		item.className = 'item item-left';
		item.innerHTML =
			`<div class="avatar"><img src="img/terminal.png" /></div><div class="bubble bubble-left" id="msg-${lastMessageId}">${msg}</div>`;
		document.querySelector(`#${terminalId}`).appendChild(item);
	}
	lastMessageTime = curTime;
	scrollTopToEnd(terminalId);
}

function addSystemMessage(terminalId, msg) {
	let item = document.createElement('div');
	item.className = 'item item-center';
	item.innerHTML = `<span>${msg}</span>`;
	document.querySelector(`#${terminalId}`).appendChild(item);
}

function keyDown(input) {
	var keycode = event.keyCode;
	if (keycode == 13) { //回车键是13 
		send();
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
	var dt = new Date().getTime();
	var uuid = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = (dt + Math.random() * 16) % 16 | 0;
		dt = Math.floor(dt / 16);
		return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
	});
	return uuid;
}
