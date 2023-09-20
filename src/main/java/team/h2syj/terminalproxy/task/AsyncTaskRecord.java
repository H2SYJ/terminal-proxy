package team.h2syj.terminalproxy.task;

import java.util.concurrent.Future;

public record AsyncTaskRecord(AbstractAsyncTask task, Future<?> future) {
}
