package team.h2syj.terminalproxy.task.impl;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import team.h2syj.terminalproxy.task.AbstractAsyncTask;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;

@Slf4j
public class TerminalExecutor extends AbstractAsyncTask {

    private final WebSocketSession session;
    private final String[] command;
    private Process process;
    private boolean stop;

    public TerminalExecutor(WebSocketSession session, String... command) {
        this.session = session;
        this.command = command;
    }

    @Override
    public void run() {
        try {
            this.process = Runtime.getRuntime().exec(command);
            //取得命令结果的输出流
            InputStream fis = process.getInputStream();
            //用一个读输出流类去读
            InputStreamReader isr = new InputStreamReader(fis);
            //用缓冲器读行
            BufferedReader br = new BufferedReader(isr);
            String line = null;
            //直到读完为止
            while (!stop && (line = br.readLine()) != null)
                session.sendMessage(new TextMessage(line));
            process.waitFor();
        } catch (IOException | InterruptedException e) {
            log.error(e.getMessage(), e);
            try {
                if (session.isOpen())
                    session.sendMessage(new TextMessage(e.getMessage()));
            } catch (IOException ex) {
                log.error(e.getMessage(), e);
            }
        }
    }

    @Override
    public void stop() {
        stop = true;
        process.destroy();
    }
}
