package team.h2syj.terminalproxy.handler;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import team.h2syj.terminalproxy.core.WebSocketSessionManager;
import team.h2syj.terminalproxy.task.AsyncTaskManager;
import team.h2syj.terminalproxy.task.impl.TerminalExecutor;

@Slf4j
@Component
public class TerminalHandler extends AbstractWebSocketHandler {

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        log.info("建立ws连接");
        WebSocketSessionManager.add(session.getId(), session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // 获得客户端传来的消息
        String payload = message.getPayload();
        if (payload.startsWith("#")) {
            final String command = payload.substring(1);
            new AdminCommand(session, command).execute();
            return;
        }
        final String[] command = payload.split(" ");
        final TerminalExecutor task = new TerminalExecutor(session, command);
        final boolean success = AsyncTaskManager.registerTask(session.getId(), task);
        if (!success) {
            log.info("{} 已经存在待处理的终端任务", session.getId());
            session.sendMessage(new TextMessage("当前已经存在待处理的终端任务"));
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("异常处理");
        WebSocketSessionManager.removeAndClose(session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        log.info("关闭ws连接");
        WebSocketSessionManager.removeAndClose(session.getId());
    }

}
