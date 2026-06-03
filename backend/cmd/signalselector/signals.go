package main

type signal struct {
	Quote      string
	Author     string
	Archetypes []string
}

// minArchetypeMatches is the minimum number of archetype-tagged quotes required
// before falling back to neutral selection.
const minArchetypeMatches = 3

// signals is the tagged quote library. Each quote carries one or more archetype
// tags matching the shadow profile PrimaryArchetype values stored in Postgres.
// Archetypes: "abandoned_child" | "unworthy_self" | "caged_rage" | "grief_carrier" | "neutral"
var signals = []signal{
	// abandoned_child
	{
		Quote:      "We accept the love we think we deserve.",
		Author:     "Chbosky",
		Archetypes: []string{"abandoned_child"},
	},
	{
		Quote:      "To love at all is to be vulnerable.",
		Author:     "C.S. Lewis",
		Archetypes: []string{"abandoned_child"},
	},
	{
		Quote:      "The wound is the place where the light enters you.",
		Author:     "Rumi",
		Archetypes: []string{"abandoned_child", "grief_carrier"},
	},
	{
		Quote:      "You alone are enough. You have nothing to prove to anybody.",
		Author:     "Angelou",
		Archetypes: []string{"abandoned_child", "unworthy_self"},
	},
	{
		Quote:      "The most painful thing is losing yourself in the process of loving someone too much.",
		Author:     "Hemingway",
		Archetypes: []string{"abandoned_child"},
	},
	{
		Quote:      "Loneliness is proof that your innate search for connection is intact.",
		Author:     "Martha Beck",
		Archetypes: []string{"abandoned_child"},
	},
	{
		Quote:      "Until you make the unconscious conscious, it will direct your life and you will call it fate.",
		Author:     "Jung",
		Archetypes: []string{"abandoned_child", "unworthy_self"},
	},
	{
		Quote:      "The only way out is through.",
		Author:     "Frost",
		Archetypes: []string{"abandoned_child", "grief_carrier"},
	},

	// unworthy_self
	{
		Quote:      "You yourself, as much as anybody in the universe, deserve your love and affection.",
		Author:     "Buddha",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "Shame derives its power from being unspeakable.",
		Author:     "Brené Brown",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "Owning our story and loving ourselves through that process is the bravest thing we'll ever do.",
		Author:     "Brené Brown",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "The most common form of despair is not being who you are.",
		Author:     "Kierkegaard",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "You are allowed to be both a masterpiece and a work in progress simultaneously.",
		Author:     "Unknown",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "To thine own self be true.",
		Author:     "Shakespeare",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "True nobility is being superior to your former self.",
		Author:     "Hemingway",
		Archetypes: []string{"unworthy_self"},
	},
	{
		Quote:      "No one can make you feel inferior without your consent.",
		Author:     "Roosevelt",
		Archetypes: []string{"unworthy_self", "caged_rage"},
	},

	// caged_rage
	{
		Quote:      "Anyone can become angry — that is easy. But to be angry with the right person, to the right degree, at the right time — that is not easy.",
		Author:     "Aristotle",
		Archetypes: []string{"caged_rage"},
	},
	{
		Quote:      "Boundaries are the distance at which I can love you and me simultaneously.",
		Author:     "Prentis Hemphill",
		Archetypes: []string{"caged_rage"},
	},
	{
		Quote:      "He who masters himself is mightier than he who conquers cities.",
		Author:     "Proverbs",
		Archetypes: []string{"caged_rage"},
	},
	{
		Quote:      "Between stimulus and response there is a space. In that space is our power to choose our response.",
		Author:     "Frankl",
		Archetypes: []string{"caged_rage"},
	},
	{
		Quote:      "The tiger does not lose sleep over the opinion of sheep.",
		Author:     "Unknown",
		Archetypes: []string{"caged_rage"},
	},
	{
		Quote:      "Resentment is like drinking poison and waiting for the other person to die.",
		Author:     "Saint Augustine",
		Archetypes: []string{"caged_rage"},
	},
	{
		Quote:      "What we fear doing most is usually what we most need to do.",
		Author:     "Ferriss",
		Archetypes: []string{"caged_rage", "neutral"},
	},
	{
		Quote:      "What you resist, persists.",
		Author:     "Jung",
		Archetypes: []string{"caged_rage", "neutral"},
	},

	// grief_carrier
	{
		Quote:      "Grief is the price we pay for love.",
		Author:     "Queen Elizabeth II",
		Archetypes: []string{"grief_carrier"},
	},
	{
		Quote:      "What we have once enjoyed we can never lose. All that we love deeply becomes a part of us.",
		Author:     "Keller",
		Archetypes: []string{"grief_carrier"},
	},
	{
		Quote:      "There is no grief like the grief that does not speak.",
		Author:     "Longfellow",
		Archetypes: []string{"grief_carrier"},
	},
	{
		Quote:      "To live is to suffer. To survive is to find some meaning in the suffering.",
		Author:     "Nietzsche",
		Archetypes: []string{"grief_carrier"},
	},
	{
		Quote:      "Perhaps the deeper truth is that grief is love with nowhere to go.",
		Author:     "Jamie Anderson",
		Archetypes: []string{"grief_carrier"},
	},
	{
		Quote:      "The darker the night, the brighter the stars.",
		Author:     "Dostoevsky",
		Archetypes: []string{"grief_carrier"},
	},
	{
		Quote:      "In the depths of winter, I found there was, within me, an invincible summer.",
		Author:     "Camus",
		Archetypes: []string{"grief_carrier", "neutral"},
	},
	{
		Quote:      "When we are no longer able to change a situation, we are challenged to change ourselves.",
		Author:     "Frankl",
		Archetypes: []string{"grief_carrier", "neutral"},
	},

	// neutral
	{
		Quote:      "He who has a why to live can bear almost any how.",
		Author:     "Nietzsche",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "The question is not what you look at, but what you see.",
		Author:     "Thoreau",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "You do not rise to the level of your goals, you fall to the level of your systems.",
		Author:     "Clear",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "The cave you fear to enter holds the treasure you seek.",
		Author:     "Campbell",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "We cannot solve our problems with the same thinking we used when we created them.",
		Author:     "Einstein",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "The unexamined life is not worth living.",
		Author:     "Socrates",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "Do not go where the path may lead; go instead where there is no path and leave a trail.",
		Author:     "Emerson",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "It does not matter how slowly you go as long as you do not stop.",
		Author:     "Confucius",
		Archetypes: []string{"neutral"},
	},
	{
		Quote:      "The only journey is the one within.",
		Author:     "Rilke",
		Archetypes: []string{"neutral"},
	},
}
