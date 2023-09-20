package team.h2syj.terminalproxy.handler;

import org.springframework.web.socket.WebSocketSession;
import team.h2syj.terminalproxy.handler.command.AbstractCommand;
import team.h2syj.terminalproxy.handler.command.StopCommand;

public record AdminCommand(WebSocketSession session, String command) {

    public void execute() {
        if (command == null || "".equals(command))
            return;
        final String[] split = command.split(" ");
        if (split.length >= 1) {
            final String str = split[0];
            AbstractCommand command = switch (str) {
                case "stop" -> new StopCommand(session.getId());
                default -> null;
            };
            if (command != null)
                command.execute();
        }
    }

}
