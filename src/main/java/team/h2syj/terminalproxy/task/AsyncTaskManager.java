package team.h2syj.terminalproxy.task;

import lombok.extern.slf4j.Slf4j;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Slf4j
public class AsyncTaskManager {

    private static final ExecutorService pool = Executors.newFixedThreadPool(6);
    private static final Map<String, AsyncTaskRecord> tasks = new LinkedHashMap<>();

    static {
        new Thread(() -> {
            while (true) {
                tasks.values().removeIf(record -> record.future().isDone());
                try {
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    log.error(e.getMessage(), e);
                }
            }
        }).start();
    }

    public static String createTask(AbstractAsyncTask task) {
        final String taskId = UUID.randomUUID().toString();
        registerTask(taskId, task);
        return taskId;
    }

    public static boolean registerTask(String taskId, AbstractAsyncTask task) {
        if (tasks.containsKey(taskId))
            return false;
        final Future<?> future = pool.submit(task);
        tasks.put(taskId, new AsyncTaskRecord(task, future));
        return true;
    }

    public static Optional<AbstractAsyncTask> getTask(String taskId) {
        return Optional.ofNullable(tasks.get(taskId)).map(AsyncTaskRecord::task);
    }

}
