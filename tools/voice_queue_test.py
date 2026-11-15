import threading
import unittest

from voice_queue import VoiceQueue


class VoiceQueueTest(unittest.TestCase):
    def test_live_reply_overtakes_background_work(self):
        queue = VoiceQueue()
        self.assertTrue(queue.acquire(2, lambda: False))
        order = []

        def run(name, priority):
            if queue.acquire(priority, lambda: False):
                order.append(name)
                queue.release()

        workers = []
        for name, priority in [('dub', 2), ('prepare', 1), ('live1', 0), ('live2', 0)]:
            worker = threading.Thread(target=run, args=(name, priority))
            worker.start()
            workers.append(worker)
            with queue.condition:
                self.assertTrue(queue.condition.wait_for(lambda: len(queue.waiting) == len(workers), 1))
        self.assertTrue(queue.should_yield(2))
        self.assertTrue(queue.should_yield(1))
        self.assertFalse(queue.should_yield(0))
        queue.release()
        for worker in workers:
            worker.join(2)
            self.assertFalse(worker.is_alive())
        self.assertEqual(order, ['live1', 'live2', 'prepare', 'dub'])
        self.assertEqual(queue.status(), {'busy': False, 'queued': 0})

    def test_disconnect_and_timeout_remove_queued_jobs(self):
        queue = VoiceQueue()
        self.assertTrue(queue.acquire(2, lambda: False))
        with self.assertRaises(ConnectionAbortedError):
            queue.acquire(0, lambda: True)
        self.assertFalse(queue.acquire(0, lambda: False, timeout=0))
        self.assertEqual(queue.status(), {'busy': True, 'queued': 0})
        self.assertFalse(queue.should_yield(2))
        queue.release()
        self.assertTrue(queue.acquire(0, lambda: False))
        queue.release()


if __name__ == '__main__':
    unittest.main()
