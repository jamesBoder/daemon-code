package signal

import "testing"

const minPoolSize = 6 // must cover deck wordsPerTest

var archetypes = []string{"abandoned_child", "unworthy_self", "caged_rage", "grief_carrier", "default"}

func TestWordLibraryIntegrity(t *testing.T) {
	seen := map[string]bool{}
	known := map[string]bool{}
	for _, a := range archetypes {
		known[a] = true
	}
	for _, w := range Words {
		if w.Text == "" || seen[w.Text] {
			t.Fatalf("missing or duplicate word %q", w.Text)
		}
		seen[w.Text] = true
		for _, a := range w.CoreFor {
			if !known[a] {
				t.Fatalf("word %q tagged for unknown archetype %q", w.Text, a)
			}
		}
	}
}

func TestCoreAndExplorePools(t *testing.T) {
	for _, a := range archetypes {
		core := CoreWords(a)
		explore := ExploreWords(a)
		if len(core) < minPoolSize {
			t.Fatalf("%s core pool has %d words, want >= %d", a, len(core), minPoolSize)
		}
		if len(explore) < minPoolSize {
			t.Fatalf("%s explore pool has %d words, want >= %d", a, len(explore), minPoolSize)
		}
		inCore := map[string]bool{}
		for _, w := range core {
			inCore[w.Text] = true
		}
		for _, w := range explore {
			if inCore[w.Text] {
				t.Fatalf("%s: word %q in both core and explore pools", a, w.Text)
			}
		}
	}
}

func TestCoreWordsFallsBackToDefault(t *testing.T) {
	got := CoreWords("not_an_archetype")
	want := CoreWords("default")
	if len(got) != len(want) || len(got) == 0 {
		t.Fatalf("unknown archetype returned %d words, default has %d", len(got), len(want))
	}
}
