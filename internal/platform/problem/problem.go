// Package problem renders RFC 9457 problem details, the API standard fixed
// by docs/technical-design.md section 15. Every module returns errors through
// this package so client error handling is uniform.
package problem

import (
	"encoding/json"
	"net/http"
)

// Detail is an RFC 9457 problem details body.
type Detail struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail,omitempty"`
	Code   string `json:"code,omitempty"`
}

// Write sends a problem details response with the correct content type.
func Write(w http.ResponseWriter, status int, code, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Detail{
		Type:   "about:blank",
		Title:  title,
		Status: status,
		Detail: detail,
		Code:   code,
	})
}

func BadRequest(w http.ResponseWriter, code, detail string) {
	Write(w, http.StatusBadRequest, code, "Bad request", detail)
}

func Unauthorized(w http.ResponseWriter, detail string) {
	Write(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", detail)
}

func Forbidden(w http.ResponseWriter, detail string) {
	Write(w, http.StatusForbidden, "forbidden", "Forbidden", detail)
}

func NotFound(w http.ResponseWriter, detail string) {
	Write(w, http.StatusNotFound, "not_found", "Not found", detail)
}

func Conflict(w http.ResponseWriter, code, detail string) {
	Write(w, http.StatusConflict, code, "Conflict", detail)
}

func Internal(w http.ResponseWriter, detail string) {
	Write(w, http.StatusInternalServerError, "internal_error", "Internal server error", detail)
}
