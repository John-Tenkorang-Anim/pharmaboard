package workspace

import (
	"testing"
	"time"
)

func TestResourceValidation(t *testing.T) {
	now := time.Now()
	valid := Resource{Kind: "learning", Title: "Research methods", Description: "Study design", Category: "Research", Organization: "Educator", URL: "https://www.youtube.com/watch?v=abcdefghijk"}
	for _, tc := range []struct {
		name   string
		mutate func(*Resource)
		want   bool
	}{
		{"youtube", func(v *Resource) {}, true},
		{"short link", func(v *Resource) { v.URL = "https://youtu.be/abcdefghijk" }, true},
		{"script", func(v *Resource) { v.URL = "javascript:alert(1)" }, false},
		{"lookalike", func(v *Resource) { v.URL = "https://youtube.com.evil.test/watch?v=abcdefghijk" }, false},
		{"credentials", func(v *Resource) { v.URL = "https://someone@youtube.com/watch?v=abcdefghijk" }, false},
		{"http", func(v *Resource) { v.URL = "http://youtube.com/watch?v=abcdefghijk" }, false},
		{"teams", func(v *Resource) {
			v.Kind = "sessions"
			v.URL = "https://teams.microsoft.com/l/meetup-join/example"
			v.StartsAt = &now
		}, true},
		{"missing time", func(v *Resource) { v.Kind = "sessions"; v.URL = "https://teams.microsoft.com/l/meetup-join/example" }, false},
		{"untrusted meeting", func(v *Resource) { v.Kind = "sessions"; v.URL = "https://example.com/meeting"; v.StartsAt = &now }, false},
		{"job", func(v *Resource) { v.Kind = "jobs"; v.URL = "https://example.com/jobs/pharmacist" }, true},
		{"empty title", func(v *Resource) { v.Title = "" }, false},
		{"unknown kind", func(v *Resource) { v.Kind = "notice" }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v := valid
			tc.mutate(&v)
			if got := validResource(v); got != tc.want {
				t.Fatalf("validResource=%v, want %v", got, tc.want)
			}
		})
	}
}

func TestMeetingCodeNormalization(t *testing.T) {
	for _, tc := range []struct {
		input string
		valid bool
	}{
		{"ab12-cd34-ef56", true}, {" AB12CD34EF56 ", true}, {"", false}, {"example.com", false}, {"AB12-CD34-EF5G", false}, {"AB12", false},
	} {
		if got := meetingCodePattern.MatchString(normalizeMeetingCode(tc.input)); got != tc.valid {
			t.Errorf("code %q valid=%v, want %v", tc.input, got, tc.valid)
		}
	}
}
