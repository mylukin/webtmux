package server

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"webtmux/pkg/randomstring"
)

const authTokenLength = 32
const authTokenTTL = 1 * time.Hour

type authTokenInfo struct {
	expiresAt time.Time
	ip        string
}

type authTokenStore struct {
	mu     sync.Mutex
	tokens map[string]authTokenInfo
	ttl    time.Duration
}

func newAuthTokenStore(ttl time.Duration) *authTokenStore {
	return &authTokenStore{
		tokens: make(map[string]authTokenInfo),
		ttl:    ttl,
	}
}

func (store *authTokenStore) issue(ip string) string {
	store.mu.Lock()
	defer store.mu.Unlock()

	now := time.Now()
	store.pruneLocked(now)

	for {
		token := randomstring.Generate(authTokenLength)
		if _, exists := store.tokens[token]; exists {
			continue
		}
		store.tokens[token] = authTokenInfo{
			expiresAt: now.Add(store.ttl),
			ip:        ip,
		}
		return token
	}
}

func (store *authTokenStore) validate(token string, ip string) bool {
	if token == "" {
		return false
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	now := time.Now()
	store.pruneLocked(now)

	info, ok := store.tokens[token]
	if !ok {
		return false
	}
	if now.After(info.expiresAt) {
		delete(store.tokens, token)
		return false
	}
	if info.ip != "" && ip != "" && info.ip != ip {
		return false
	}

	return true
}

func (store *authTokenStore) pruneLocked(now time.Time) {
	for token, info := range store.tokens {
		if now.After(info.expiresAt) {
			delete(store.tokens, token)
		}
	}
}

func clientIPFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}

	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ip := strings.Split(forwarded, ",")[0]
		return strings.TrimSpace(ip)
	}

	return ipFromAddr(r.RemoteAddr)
}

func ipFromAddr(addr string) string {
	if addr == "" {
		return ""
	}

	host, _, err := net.SplitHostPort(addr)
	if err == nil {
		return host
	}

	return strings.TrimSpace(addr)
}

func (server *Server) issueAuthToken(r *http.Request) string {
	if !server.options.EnableBasicAuth || server.authTokens == nil {
		return ""
	}

	if !server.options.AuthIPBinding {
		return server.authTokens.issue("")
	}

	return server.authTokens.issue(clientIPFromRequest(r))
}

func (server *Server) validateAuthToken(token string, ip string) bool {
	if !server.options.EnableBasicAuth {
		return true
	}
	if server.authTokens == nil {
		return false
	}

	if !server.options.AuthIPBinding {
		return server.authTokens.validate(token, "")
	}

	return server.authTokens.validate(token, ip)
}
