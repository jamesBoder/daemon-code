package notifier

import "testing"

func TestClassifyPushStatus(t *testing.T) {
	cases := []struct {
		status   int
		wantGone bool
		wantErr  bool
	}{
		{200, false, false},
		{201, false, false},
		{404, true, false},
		{410, true, false},
		{429, false, true},
		{500, false, true},
		{400, false, true},
	}
	for _, c := range cases {
		gone, err := classifyPushStatus(c.status)
		if gone != c.wantGone || (err != nil) != c.wantErr {
			t.Errorf("status %d: gone=%v err=%v, want gone=%v err=%v", c.status, gone, err, c.wantGone, c.wantErr)
		}
	}
}

func TestFirstSentence(t *testing.T) {
	if got := firstSentence("One. Two."); got != "One" {
		t.Errorf("got %q", got)
	}
	long := make([]byte, 200)
	for i := range long {
		long[i] = 'a'
	}
	if got := firstSentence(string(long)); len(got) != 120 {
		t.Errorf("len %d, want 120", len(got))
	}
}
