package localcommand

import (
	"bytes"
	"reflect"
	"testing"
	"time"
)

func TestNewFactory(t *testing.T) {
	// Use SIGTERM (15) as close signal and 1 second timeout for faster test
	factory, err := NewFactory("/bin/sh", []string{}, &Options{CloseSignal: 15, CloseTimeout: 1})
	if err != nil {
		t.Errorf("NewFactory() returned error")
		return
	}
	if factory.command != "/bin/sh" {
		t.Errorf("factory.command = %v, expected %v", factory.command, "/bin/sh")
	}
	if !reflect.DeepEqual(factory.argv, []string{}) {
		t.Errorf("factory.argv = %v, expected %v", factory.argv, []string{})
	}
	if !reflect.DeepEqual(factory.options, &Options{CloseSignal: 15, CloseTimeout: 1}) {
		t.Errorf("factory.options = %v, expected %v", factory.options, &Options{CloseSignal: 15, CloseTimeout: 1})
	}

	slave, err := factory.New(nil, nil)
	if err != nil {
		t.Errorf("factory.New() returned error: %v", err)
		return
	}
	lcmd := slave.(*LocalCommand)
	if lcmd.closeSignal != 15 {
		t.Errorf("lcmd.closeSignal = %v, expected %v", lcmd.closeSignal, 15)
	}
	if lcmd.closeTimeout != time.Second*1 {
		t.Errorf("lcmd.closeTimeout = %v, expected %v", lcmd.closeTimeout, time.Second*1)
	}
	slave.Close()
}

func TestFactoryNew(t *testing.T) {
	factory, err := NewFactory("/bin/cat", []string{}, &Options{})
	if err != nil {
		t.Errorf("NewFactory() returned error")
		return
	}

	slave, err := factory.New(nil, nil)
	if err != nil {
		t.Errorf("factory.New() returned error")
		return
	}

	writeBuf := []byte("foobar\n")
	n, err := slave.Write(writeBuf)
	if err != nil {
		t.Errorf("write() failed: %v", err)
		return
	}
	if n != 7 {
		t.Errorf("Unexpected write length. n = %d, expected n = %d", n, 7)
		return
	}

	// Local echo is on, so we get the output twice:
	// Once because we're "typing" it, and once more
	// repeated back to us by `cat`. Also, \r\n
	// because we're a terminal.
	expectedBuf := []byte("foobar\r\nfoobar\r\n")
	readBuf := make([]byte, 1024)
	var totalRead int
	for totalRead < 16 {
		n, err = slave.Read(readBuf[totalRead:])
		if err != nil {
			t.Errorf("read() failed: %v", err)
			return
		}
		totalRead += n
	}
	if totalRead != 16 {
		t.Errorf("Unexpected read length. totalRead = %d, expected totalRead = %d", totalRead, 16)
		return
	}
	if !bytes.Equal(readBuf[:totalRead], expectedBuf) {
		t.Errorf("unexpected output from slave: got %v, expected %v", readBuf[:totalRead], expectedBuf)
	}
	err = slave.Close()
	if err != nil {
		t.Errorf("close() failed: %v", err)
		return
	}

}
