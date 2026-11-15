"""One model at a time, with live replies ahead of speculative speech."""
import threading
import time


class VoiceQueue:
    def __init__(self):
        self.condition = threading.Condition()
        self.waiting = []
        self.active = False

    def acquire(self, priority, disconnected, timeout=30):
        deadline = time.monotonic() + timeout
        job = (priority, object())
        with self.condition:
            self.waiting.append(job)
            try:
                while True:
                    if disconnected():
                        raise ConnectionAbortedError('Speech client disconnected while queued.')
                    first = min(self.waiting, key=lambda item: item[0])
                    if not self.active and first is job:
                        self.active = True
                        return True
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        return False
                    self.condition.wait(min(.1, remaining))
            finally:
                self.waiting.remove(job)
                self.condition.notify_all()

    def should_yield(self, priority):
        with self.condition:
            return any(other < priority for other, _ in self.waiting)

    def release(self):
        with self.condition:
            self.active = False
            self.condition.notify_all()

    def status(self):
        with self.condition:
            return {'busy': self.active, 'queued': len(self.waiting)}
