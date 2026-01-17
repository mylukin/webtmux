package server

import (
	"net"
	"net/http"
	"net/url"
	"strings"
)

func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	originHost := originURL.Hostname()
	originPort := originURL.Port()
	reqHost := r.Host
	reqPort := ""
	if host, port, err := net.SplitHostPort(reqHost); err == nil {
		reqHost = host
		reqPort = port
	}

	if !strings.EqualFold(originHost, reqHost) {
		return false
	}
	if originPort == "" || reqPort == "" {
		return true
	}
	return originPort == reqPort
}
