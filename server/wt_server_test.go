package server

import (
	"net/http/httptest"
	"testing"
)

func TestNewWebTransportServer(t *testing.T) {
	tests := []struct {
		name       string
		options    *Options
		pathPrefix string
		wantErr    bool
	}{
		{
			name: "valid options without origin check",
			options: &Options{
				Address:  "0.0.0.0",
				Port:     "8443",
				WSOrigin: "",
			},
			pathPrefix: "/",
			wantErr:    false,
		},
		{
			name: "valid options with origin regex",
			options: &Options{
				Address:  "localhost",
				Port:     "9443",
				WSOrigin: `https://example\.com`,
			},
			pathPrefix: "/terminal/",
			wantErr:    false,
		},
		{
			name: "invalid origin regex",
			options: &Options{
				Address:  "localhost",
				Port:     "8443",
				WSOrigin: "[invalid regex",
			},
			pathPrefix: "/",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, err := NewWebTransportServer(tt.options, tt.pathPrefix)

			if tt.wantErr {
				if err == nil {
					t.Error("NewWebTransportServer() expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Errorf("NewWebTransportServer() unexpected error: %v", err)
				return
			}

			if server == nil {
				t.Error("NewWebTransportServer() returned nil server")
				return
			}

			if server.options != tt.options {
				t.Error("server.options mismatch")
			}

			if server.pathPrefix != tt.pathPrefix {
				t.Errorf("server.pathPrefix = %s, want %s", server.pathPrefix, tt.pathPrefix)
			}

			if server.server == nil {
				t.Error("server.server (webtransport.Server) is nil")
			}
		})
	}
}

func TestWebTransportServerClose(t *testing.T) {
	options := &Options{
		Address: "127.0.0.1",
		Port:    "8443",
	}

	server, err := NewWebTransportServer(options, "/")
	if err != nil {
		t.Fatalf("NewWebTransportServer() error: %v", err)
	}

	// Close should not panic or return error
	err = server.Close()
	if err != nil {
		t.Errorf("Close() returned error: %v", err)
	}
}

func TestWebTransportServerServer(t *testing.T) {
	options := &Options{
		Address: "127.0.0.1",
		Port:    "8443",
	}

	wts, err := NewWebTransportServer(options, "/test/")
	if err != nil {
		t.Fatalf("NewWebTransportServer() error: %v", err)
	}

	// Server() should return the underlying webtransport.Server
	underlying := wts.Server()
	if underlying == nil {
		t.Error("Server() returned nil")
	}
}

func TestWebTransportServerAddressFormat(t *testing.T) {
	tests := []struct {
		name     string
		address  string
		port     string
		wantAddr string
	}{
		{
			name:     "localhost with port",
			address:  "localhost",
			port:     "8443",
			wantAddr: "localhost:8443",
		},
		{
			name:     "0.0.0.0 with port",
			address:  "0.0.0.0",
			port:     "9443",
			wantAddr: "0.0.0.0:9443",
		},
		{
			name:     "specific IP with port",
			address:  "192.168.1.100",
			port:     "443",
			wantAddr: "192.168.1.100:443",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			options := &Options{
				Address: tt.address,
				Port:    tt.port,
			}

			wts, err := NewWebTransportServer(options, "/")
			if err != nil {
				t.Fatalf("NewWebTransportServer() error: %v", err)
			}

			// Check the address on the underlying HTTP/3 server
			addr := wts.Server().H3.Addr
			if addr != tt.wantAddr {
				t.Errorf("H3.Addr = %s, want %s", addr, tt.wantAddr)
			}
		})
	}
}

func TestWebTransportServerOriginCheck(t *testing.T) {
	tests := []struct {
		name        string
		wsOrigin    string
		host        string
		origin      string
		shouldAllow bool
	}{
		{
			name:        "default same-origin",
			wsOrigin:    "",
			host:        "example.com",
			origin:      "https://example.com",
			shouldAllow: true,
		},
		{
			name:        "default cross-origin",
			wsOrigin:    "",
			host:        "example.com",
			origin:      "https://evil.com",
			shouldAllow: false,
		},
		{
			name:        "exact match",
			wsOrigin:    `^https://example\.com$`,
			host:        "other.com",
			origin:      "https://example.com",
			shouldAllow: true,
		},
		{
			name:        "no match",
			wsOrigin:    `^https://example\.com$`,
			host:        "example.com",
			origin:      "https://other.com",
			shouldAllow: false,
		},
		{
			name:        "subdomain pattern",
			wsOrigin:    `https://.*\.example\.com`,
			host:        "example.com",
			origin:      "https://sub.example.com",
			shouldAllow: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			options := &Options{
				Address:  "localhost",
				Port:     "8443",
				WSOrigin: tt.wsOrigin,
			}

			wts, err := NewWebTransportServer(options, "/")
			if err != nil {
				t.Fatalf("NewWebTransportServer() error: %v", err)
			}

			req := httptest.NewRequest("GET", "https://"+tt.host+"/", nil)
			req.Host = tt.host
			req.Header.Set("Origin", tt.origin)

			allowed := wts.server.CheckOrigin(req)
			if allowed != tt.shouldAllow {
				t.Errorf("Origin check for %q on host %q = %v, want %v", tt.origin, tt.host, allowed, tt.shouldAllow)
			}
		})
	}
}

func TestWebTransportServerPathPrefix(t *testing.T) {
	tests := []struct {
		name       string
		pathPrefix string
	}{
		{"root", "/"},
		{"with slash", "/terminal/"},
		{"deep path", "/api/v1/terminal/"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			options := &Options{
				Address: "localhost",
				Port:    "8443",
			}

			wts, err := NewWebTransportServer(options, tt.pathPrefix)
			if err != nil {
				t.Fatalf("NewWebTransportServer() error: %v", err)
			}
			defer wts.Close()

			if wts.pathPrefix != tt.pathPrefix {
				t.Errorf("pathPrefix = %s, want %s", wts.pathPrefix, tt.pathPrefix)
			}
		})
	}
}

func TestWebTransportServerMultipleClose(t *testing.T) {
	options := &Options{
		Address: "127.0.0.1",
		Port:    "8443",
	}

	server, err := NewWebTransportServer(options, "/")
	if err != nil {
		t.Fatalf("NewWebTransportServer() error: %v", err)
	}

	// First close should succeed
	err = server.Close()
	if err != nil {
		t.Errorf("First Close() returned error: %v", err)
	}

	// Second close should also not error (idempotent)
	err = server.Close()
	if err != nil {
		t.Errorf("Second Close() returned error: %v", err)
	}
}

func TestWebTransportServerOptions(t *testing.T) {
	options := &Options{
		Address:  "192.168.1.1",
		Port:     "9443",
		WSOrigin: `^https://trusted\.com$`,
	}

	wts, err := NewWebTransportServer(options, "/wt/")
	if err != nil {
		t.Fatalf("NewWebTransportServer() error: %v", err)
	}
	defer wts.Close()

	// Verify options are stored
	if wts.options != options {
		t.Error("options reference mismatch")
	}

	// Verify origin regex is compiled
	if wts.originRegexp == nil {
		t.Error("originRegexp should be compiled for WSOrigin")
	}

	// Test origin matching
	if !wts.originRegexp.MatchString("https://trusted.com") {
		t.Error("Origin regex should match https://trusted.com")
	}
	if wts.originRegexp.MatchString("https://untrusted.com") {
		t.Error("Origin regex should not match https://untrusted.com")
	}
}

// Benchmark server creation
func BenchmarkNewWebTransportServer(b *testing.B) {
	options := &Options{
		Address:  "0.0.0.0",
		Port:     "8443",
		WSOrigin: `https://.*\.example\.com`,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		server, _ := NewWebTransportServer(options, "/")
		if server != nil {
			server.Close()
		}
	}
}
