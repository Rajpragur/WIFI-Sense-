import json
import os
import socket
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from test_live import module
import collector

class NativeCollectorTests(unittest.TestCase):
    def test_native_socket_response_and_permissions(self):
        with tempfile.TemporaryDirectory(prefix='wfstest-', dir='/tmp') as folder:
            directory=Path(folder); path=directory/'s'
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
                server.bind(str(path)); server.listen(1)
                def reply():
                    conn,_=server.accept()
                    with conn:
                        self.assertEqual(conn.recv(512),b'scan\n')
                        conn.sendall(json.dumps({'collector':'native_app','networks':[{'ssid':'example'}]}).encode()+b'\n')
                worker=threading.Thread(target=reply);worker.start()
                with patch.object(collector,'SOCKET_DIR',directory),patch.object(collector,'SOCKET',path):
                    result=collector.native_request('scan')
                worker.join(3)
            self.assertEqual(result['networks'][0]['ssid'],'example')

    def test_insecure_directory_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix='wfstest-', dir='/tmp') as folder:
            directory=Path(folder);directory.chmod(0o755)
            with patch.object(collector,'SOCKET_DIR',directory),patch.object(collector,'SOCKET',directory/'s'):
                with self.assertRaises(OSError):collector.native_request('status')

    def test_existing_agent_endpoint_uses_native_result(self):
        sample={'collector':'native_app','location_authorization':'authorized','ssid':'example','rssi':-52}
        with patch.object(module,'collect',return_value=sample):
            self.assertEqual(module.agent('status'),sample)

    def test_collector_error_propagates_without_fake_data(self):
        with patch.object(module,'collect',return_value={'error':'No Wi-Fi interface found.'}):
            with self.assertRaises(module.HTTPException) as result:module.agent('scan')
        self.assertEqual(result.exception.status_code,503)

if __name__ == '__main__':unittest.main()
