const terminalProxyHost = 'ws://192.168.3.33:2330/terminal';
let history = [];
let historyCursor = -1;
let terminals = [];
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
		addSystemMessage(e);
		console.log(e);
	}

	let item = document.createElement('div');
	item.className = 'item item-right';
	item.innerHTML =
		`<div class="bubble bubble-right">${msg}</div><div class="avatar"><img src="img/user.png" /></div>`;
	document.querySelector('.content').appendChild(item);
	document.querySelector('#textarea').value = '';
	document.querySelector('#textarea').focus();
	scrollTopToEnd();
}

function connection() {
	let socket = new WebSocket(terminalProxyHost);
	socket.onopen = function(e) {
		addSystemMessage('开始连接');
	};
	socket.addEventListener("message", function(e) {
		reviceMessage(e.data)
	});
	terminals.push(socket);
	if (!curTerminal)
		curTerminal = socket;
}

function reviceMessage(msg) {
	let curTime = new Date().getTime();
	if (curTime - lastMessageTime < 1000) {
		document.querySelector(`#msg-${lastMessageId}`).innerHTML += "</br>" + msg;
	} else {
		lastMessageId = generateMessageId();
		let item = document.createElement('div');
		item.className = 'item item-left';
		item.innerHTML =
			`<div class="avatar"><img src="img/terminal.png" /></div><div class="bubble bubble-left" id="msg-${lastMessageId}">${msg}</div>`;
		document.querySelector('.content').appendChild(item);
	}
	lastMessageTime = curTime;
	scrollTopToEnd();
}

function addSystemMessage(msg) {
	let item = document.createElement('div');
	item.className = 'item item-center';
	item.innerHTML = `<span>${msg}</span>`;
	document.querySelector('.content').appendChild(item);
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

function scrollTopToEnd() {
	//滚动条置底
	let height = document.querySelector('.content').scrollHeight;
	document.querySelector(".content").scrollTop = height;
}

function generateMessageId() {
	var dt = new Date().getTime();
	var uuid = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = (dt + Math.random() * 16) % 16 | 0;
		dt = Math.floor(dt / 16);
		return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
	});
	return uuid;
}