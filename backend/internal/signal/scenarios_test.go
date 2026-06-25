package signal

import "testing"

// validDirections per dimension — most use high/low, locus_of_control uses
// internal/external, temporal_focus uses past/future.
func validDirection(dim, dir string) bool {
	switch dim {
	case "locus_of_control":
		return dir == "internal" || dir == "external"
	case "temporal_focus":
		return dir == "past" || dir == "future"
	default:
		return dir == "high" || dir == "low"
	}
}

func TestScenarioLibraryIntegrity(t *testing.T) {
	seenScenarios := map[string]bool{}
	for _, s := range Scenarios {
		if s.ScenarioID == "" || seenScenarios[s.ScenarioID] {
			t.Fatalf("scenario %q: missing or duplicate ScenarioID", s.Text)
		}
		seenScenarios[s.ScenarioID] = true

		// The generator selects 6 from the pool; the spec calls for 10–15 oblique nodes.
		if len(s.NodePool) < 6 {
			t.Fatalf("scenario %q has %d nodes, want >= 6", s.ScenarioID, len(s.NodePool))
		}

		seenNodes := map[string]bool{}
		for _, n := range s.NodePool {
			if n.NodeID == "" || seenNodes[n.NodeID] {
				t.Fatalf("scenario %q: missing or duplicate NodeID %q", s.ScenarioID, n.NodeID)
			}
			seenNodes[n.NodeID] = true

			if n.PrimaryDimension == "" || !validDimensions[n.PrimaryDimension] {
				t.Fatalf("scenario %q node %q: bad PrimaryDimension %q", s.ScenarioID, n.NodeID, n.PrimaryDimension)
			}
			// PrimaryDimension drives the isolated-node signal — it must be one of
			// the node's tagged dimensions.
			if _, ok := n.DimensionSignals[n.PrimaryDimension]; !ok {
				t.Fatalf("scenario %q node %q: PrimaryDimension %q not in DimensionSignals", s.ScenarioID, n.NodeID, n.PrimaryDimension)
			}
			for dim, sig := range n.DimensionSignals {
				if !validDimensions[dim] {
					t.Fatalf("scenario %q node %q: unknown dimension %q", s.ScenarioID, n.NodeID, dim)
				}
				if !validDirection(dim, sig.Direction) {
					t.Fatalf("scenario %q node %q: bad direction %q for %q", s.ScenarioID, n.NodeID, sig.Direction, dim)
				}
			}
		}

		for _, dim := range s.DimensionAffinity {
			if !validDimensions[dim] {
				t.Fatalf("scenario %q: unknown affinity dimension %q", s.ScenarioID, dim)
			}
		}
	}
}

func TestPairLibraryIntegrity(t *testing.T) {
	seenIDs := map[string]bool{}
	seenLR := map[string]bool{}
	for _, p := range Pairs {
		if p.PairID == "" || seenIDs[p.PairID] {
			t.Fatalf("pair %q: missing or duplicate PairID", p.Left+"/"+p.Right)
		}
		seenIDs[p.PairID] = true

		// LookupPair keys on left+right — that combination must be unique.
		lr := p.Left + "\x00" + p.Right
		if p.Left == "" || p.Right == "" || seenLR[lr] {
			t.Fatalf("pair %q: missing or duplicate left/right", p.PairID)
		}
		seenLR[lr] = true

		for dim := range p.DimensionSignals {
			if !validDimensions[dim] {
				t.Fatalf("pair %q: unknown dimension %q", p.PairID, dim)
			}
		}
	}
}
