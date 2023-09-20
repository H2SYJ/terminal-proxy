package team.h2syj.terminalproxy.core;

import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public class WebSocketSessionManager {

    private static final Map<String, WebSocketSession> sessionMap = new HashMap<>();


    public static void add(String id, WebSocketSession session) {
        sessionMap.put(id, session);
    }

    public static void removeAndClose(String id) throws IOException {
        if (!sessionMap.containsKey(id))
            return;
        final WebSocketSession session = sessionMap.get(id);
        sessionMap.remove(id);
        session.close();
    }
}
