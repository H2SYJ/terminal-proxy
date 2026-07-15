package team.h2syj.terminalproxy.task.impl;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import team.h2syj.terminalproxy.task.AbstractAsyncTask;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;

@Slf4j
public class TerminalExecutor extends AbstractAsyncTask {

    private final WebSocketSession session;
    private final String[] command;
    private Process process;
    private volatile boolean stop;

    public TerminalExecutor(WebSocketSession session, String... command) {
        this.session = session;
        this.command = command;
    }

    @Override
    public void run() {
        try {
            this.process = new ProcessBuilder(command)
                    // 进度信息通常写入 stderr，合并后一起发送，避免错误流阻塞子进程。
                    .redirectErrorStream(true)
                    .start();
            try (Reader reader = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
                char[] buffer = new char[1024];
                int length;
                // 保留 \r、\n 和 ANSI 控制序列，由客户端按终端语义更新当前行。
                while (!stop && (length = reader.read(buffer)) != -1) {
                    session.sendMessage(new TextMessage(new String(buffer, 0, length)));
                }
            }
            int exitValue = process.waitFor();
            session.sendMessage(new TextMessage(String.format("!exit:%s", exitValue)));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            handleError(e);
        } catch (IOException e) {
            handleError(e);
        }
    }

    private void handleError(Exception e) {
        log.error(e.getMessage(), e);
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            }
        } catch (IOException ex) {
            log.error(ex.getMessage(), ex);
        }
    }

    @Override
    public void stop() {
        stop = true;
        if (process != null) {
            process.destroy();
        }
    }
}
