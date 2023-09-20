package team.h2syj.terminalproxy.handler.command;

import team.h2syj.terminalproxy.task.AbstractAsyncTask;
import team.h2syj.terminalproxy.task.AsyncTaskManager;

public class StopCommand extends AbstractCommand {

    private final String taskId;

    public StopCommand(String taskId) {
        this.taskId = taskId;
    }

    @Override
    public void execute() {
        AsyncTaskManager.getTask(taskId).ifPresent(AbstractAsyncTask::stop);
    }
}
