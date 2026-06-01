/* ============================================================
   LitReview — mock corpus
   ============================================================ */
(function () {
  const T = (id, name) => ({ id, name });

  // Themes (per collection, but flat here for the demo collection)
  const themes = [
    T("th_we", "Worked examples"),
    T("th_meas", "Measurement"),
    T("th_exp", "Expertise reversal"),
    T("th_split", "Split attention"),
    T("th_mod", "Modality"),
    T("th_motiv", "Motivation"),
  ];
  const themeById = Object.fromEntries(themes.map((t) => [t.id, t]));

  const papers = [
    {
      id: "p_sweller88", status: "ready",
      title: "Cognitive load during problem solving: Effects on learning",
      authors: ["John Sweller"], year: 1988, journal: "Cognitive Science",
      doi: "10.1207/s15516709cog1202_4", pages: 28, annCount: 5,
      themes: ["th_we", "th_meas", "th_split"],
    },
    {
      id: "p_paas94", status: "ready",
      title: "Variability of worked examples and transfer of geometrical problem-solving skills",
      authors: ["Fred Paas", "Jeroen van Merriënboer"], year: 1994,
      journal: "Journal of Educational Psychology", doi: "10.1037/0022-0663.86.1.122",
      pages: 19, annCount: 4, themes: ["th_we", "th_meas"],
    },
    {
      id: "p_mayer02", status: "ready",
      title: "Multimedia learning: Are we asking the right questions?",
      authors: ["Richard E. Mayer"], year: 2002, journal: "Educational Psychologist",
      doi: "10.1207/S15326985EP3201_1", pages: 22, annCount: 6,
      themes: ["th_mod", "th_split"],
    },
    {
      id: "p_kalyuga07", status: "processing",
      title: "Expertise reversal effect and its implications for learner-tailored instruction",
      authors: ["Slava Kalyuga"], year: 2007, journal: "Educational Psychology Review",
      doi: "10.1007/s10648-007-9054-3", pages: 23, annCount: 0, themes: ["th_exp"],
    },
    {
      id: "p_vanmerrien05", status: "ready",
      title: "Cognitive load theory and complex learning: Recent developments and future directions",
      authors: ["Jeroen van Merriënboer", "John Sweller"], year: 2005,
      journal: "Educational Psychology Review", doi: "10.1007/s10648-005-3951-0",
      pages: 31, annCount: 3, themes: ["th_we", "th_motiv"],
    },
    {
      id: "p_chandler91", status: "ready",
      title: "Cognitive load theory and the format of instruction",
      authors: ["Paul Chandler", "John Sweller"], year: 1991, journal: "Cognition and Instruction",
      doi: "10.1207/s1532690xci0804_2", pages: 39, annCount: 2, themes: ["th_split", "th_mod"],
    },
    {
      id: "p_leppink13", status: "failed",
      title: "Development of an instrument for measuring different types of cognitive load",
      authors: ["Jimmie Leppink", "et al."], year: 2013, journal: "Behavior Research Methods",
      doi: "10.3758/s13428-013-0334-1", pages: 12, annCount: 0, themes: [],
      error: "PDF text layer could not be extracted (scanned image).",
    },
  ];
  const paperById = Object.fromEntries(papers.map((p) => [p.id, p]));

  const reviews = [
    {
      id: "r_we", status: "ready",
      title: "Worked-example fading: a synthesis",
      collectionId: "c_fading", entries: 9, createdBy: "Elena Hart",
    },
    {
      id: "r_meas", status: "processing",
      title: "Instruments for separating intrinsic and extraneous load",
      collectionId: "c_measure", entries: 5, createdBy: "Marcus Reed",
    },
  ];

  const collections = [
    {
      id: "c_fading",
      name: "Worked-example fading",
      question: "Does gradually fading worked examples reduce cognitive load and improve transfer in novices?",
      paperIds: ["p_sweller88", "p_paas94", "p_vanmerrien05", "p_kalyuga07"],
      reviewIds: ["r_we"], color: "var(--accent)",
    },
    {
      id: "c_multimedia",
      name: "Multimedia design for STEM lectures",
      question: "Which multimedia design principles most reduce extraneous load in undergraduate STEM lectures?",
      paperIds: ["p_mayer02", "p_chandler91"],
      reviewIds: [], color: "oklch(0.6 0.1 250)",
    },
    {
      id: "c_measure",
      name: "Measuring intrinsic vs. extraneous load",
      question: "How can intrinsic and extraneous cognitive load be measured separately and reliably?",
      paperIds: ["p_sweller88", "p_leppink13"],
      reviewIds: ["r_meas"], color: "oklch(0.62 0.12 40)",
    },
  ];

  const members = [
    { id: "u_elena", name: "Elena Hart", email: "elena.hart@univ.edu", role: "owner", color: "oklch(0.47 0.08 162)", you: true },
    { id: "u_marcus", name: "Marcus Reed", email: "m.reed@univ.edu", role: "member", color: "oklch(0.55 0.11 250)" },
    { id: "u_priya", name: "Priya Nair", email: "priya.nair@univ.edu", role: "member", color: "oklch(0.58 0.12 30)" },
    { id: "u_tom", name: "Tom Fischer", email: "t.fischer@univ.edu", role: "member", color: "oklch(0.55 0.1 300)" },
  ];

  const workspaces = [
    {
      id: "w_cll", name: "Cognitive Load Lab", role: "owner",
      memberCount: 4, collectionCount: 3, paperCount: 41,
      invite: "7F3K-92QD", you: "owner",
    },
    {
      id: "w_osrg", name: "Open Science Reading Group", role: "member",
      memberCount: 11, collectionCount: 6, paperCount: 88,
      invite: "Q2WP-5X8M", you: "member",
    },
  ];

  // The paper open in the reader — full reading text + annotations
  const readerParagraphs = [
    "Considerable evidence indicates that domain-specific knowledge in the form of schemas is a major factor distinguishing experts from novices in problem-solving skill. Experts have acquired a large number of schemas that allow problem states to be recognised quickly and the appropriate moves to be retrieved with minimal cognitive effort.",
    "It is suggested that schema acquisition can be impeded by conventional problem-solving strategies. Means–ends analysis, the most general strategy available, requires a problem solver to attend simultaneously to the current problem state, the goal state, differences between them, and the operators that reduce those differences.",
    "The resulting cognitive load may be sufficient to prevent the learner from acquiring the schemas that are the real object of the exercise. In other words, a learner can solve a great many problems by means–ends analysis without learning much that is useful for related problems encountered later.",
    "Worked examples constitute an alternative to conventional problems. By directing attention to problem states and their associated moves, worked examples allow schemas to be abstracted with a far lighter load on working memory than the equivalent conventional problems impose.",
    "A series of experiments in the domains of algebra, geometry, and physics support this analysis. In each case, groups that studied worked examples outperformed groups that solved the equivalent problems conventionally, while also reporting lower mental effort during acquisition.",
    "These findings have direct implications for instructional design. Where the goal is schema acquisition rather than fluency in a single problem type, a substantial proportion of conventional problems can be profitably replaced by worked examples studied attentively.",
  ];

  // char offsets are illustrative (paragraph index + phrase)
  const annotations = [
    {
      id: "a1", para: 0, quote: "domain-specific knowledge in the form of schemas",
      comment: "Core construct — schemas as the unit of expertise. Anchor the whole review on this definition.",
      themes: ["th_we"], author: "Elena Hart", page: 257,
    },
    {
      id: "a2", para: 1, quote: "Means–ends analysis, the most general strategy available",
      comment: "This is the mechanism Sweller blames for extraneous load. Contrast with Paas '94 framing.",
      themes: ["th_split", "th_meas"], author: "Elena Hart", page: 258,
    },
    {
      id: "a3", para: 3, quote: "a far lighter load on working memory",
      comment: "Direct claim about WM load reduction — quotable for the fading argument.",
      themes: ["th_we", "th_meas"], author: "Marcus Reed", page: 259,
    },
    {
      id: "a4", para: 4, quote: "reporting lower mental effort during acquisition",
      comment: "Self-report effort measure. Note: same instrument family as Paas scale — relevant to measurement collection.",
      themes: ["th_meas"], author: "Priya Nair", page: 261,
    },
  ];

  // Matrix: rows = papers (ready, in fading collection), columns = themes
  const matrixPapers = ["p_sweller88", "p_paas94", "p_vanmerrien05"];
  const matrixThemes = ["th_we", "th_meas", "th_split", "th_exp"];
  const matrixCells = {
    "p_sweller88|th_we": [{ q: "Worked examples allow schemas to be abstracted with a far lighter load", page: 259 }],
    "p_sweller88|th_meas": [{ q: "groups… reporting lower mental effort during acquisition", page: 261 }],
    "p_sweller88|th_split": [{ q: "attend simultaneously to the current problem state, the goal state, differences…", page: 258 }],
    "p_paas94|th_we": [{ q: "High variability worked examples produced better transfer performance", page: 130 }],
    "p_paas94|th_meas": [{ q: "Mental effort rating scale administered after each acquisition item", page: 125 }, { q: "Efficiency score combines performance and invested effort", page: 127 }],
    "p_vanmerrien05|th_we": [{ q: "Completion strategy as a bridge between worked examples and full problems", page: 156 }],
    "p_vanmerrien05|th_exp": [{ q: "Faded guidance must track the growth of learner expertise", page: 161 }],
  };

  const suggestedThemes = [
    { name: "Element interactivity", rationale: "Recurs across Sweller '88 and van Merriënboer '05 as the driver of intrinsic load.", count: 4 },
    { name: "Self-report effort scales", rationale: "Paas-type rating scales appear in 6 annotations; worth separating from behavioural measures.", count: 6 },
    { name: "Completion problems", rationale: "A distinct fading technique mentioned but not yet tagged.", count: 3 },
  ];

  const chatCitations = [
    { type: "annotation", paper: "Sweller (1988)", page: 259, text: "a far lighter load on working memory" },
    { type: "paper", paper: "Paas & van Merriënboer (1994)", page: 130, text: "High variability worked examples produced better transfer" },
    { type: "annotation", paper: "van Merriënboer & Sweller (2005)", page: 161, text: "Faded guidance must track the growth of learner expertise" },
  ];

  window.LR = {
    themes, themeById, papers, paperById, reviews, collections,
    members, workspaces, readerParagraphs, annotations,
    matrixPapers, matrixThemes, matrixCells, suggestedThemes, chatCitations,
    initials: (name) => name.split(" ").map((w) => w[0]).slice(0, 2).join(""),
  };
})();
