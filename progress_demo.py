import sys
import time


TASKS = ("下载文件", "校验数据", "写入磁盘")


def configure_output_encoding() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def progress_line(name: str, percent: int) -> str:
    width = 24
    completed = width * percent // 100
    bar = "█" * completed + "░" * (width - completed)
    return f"{name} [{bar}] {percent:3d}%"


def draw_initial_screen() -> None:
    for index, name in enumerate(TASKS):
        sys.stdout.write(progress_line(name, 0))
        if index < len(TASKS) - 1:
            sys.stdout.write("\n")
    sys.stdout.flush()


def redraw_screen(percent: int) -> None:
    # 从最后一行回到第一行，再逐行清除并重绘。
    sys.stdout.write(f"\x1b[{len(TASKS) - 1}A")
    for index, name in enumerate(TASKS):
        task_percent = max(0, min(100, percent - index * 8))
        sys.stdout.write("\r\x1b[2K")
        sys.stdout.write(progress_line(name, task_percent))
        if index < len(TASKS) - 1:
            sys.stdout.write("\n")
    sys.stdout.flush()


def main() -> None:
    configure_output_encoding()
    print("开始测试多行实时进度：下面应始终只有三条任务行。", flush=True)
    draw_initial_screen()
    for percent in range(4, 109, 4):
        time.sleep(0.08)
        redraw_screen(percent)
    sys.stdout.write("\n多行进度测试完成。\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
