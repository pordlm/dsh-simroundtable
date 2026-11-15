 1812: test("C2: a late savePersona response for the workspace just left cannot touch the new workspace's form, note or busy flag", async () => {
 1813:   const previousFetch = globalThis.fetch;
 1814:   const page_answer = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
 1815:   const deferred = () => {
 1816:     let resolve;
 1817:     let reject;
 1818:     const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
 1819:     return { promise, resolve, reject };
 1820:   };
 1821:   // Each POST /personas is held on the currently armed deferred until the
 1822:   // test settles it — that is how a genuinely "late" reply is manufactured.
 1823:   let armedPost = deferred();
 1824:   const armPost = () => { armedPost = deferred(); };
 1825:   globalThis.fetch = async (url, options) => {
 1826:     const path = String(url);
 1827:     if (path === "/api/roundtable/personas" && options && options.method === "POST") {
 1828:       const gate = armedPost; // capture at invocation: A and B hold their own gates
 1829:       await gate.promise;
 1830:       return page_answer({ persona: { id: "p-new", name: "Saved" } });
 1831:     }
 1832:     if (path.startsWith("/api/roundtable/personas")) return page_answer({ binding: "opt-in", personas: [] });
 1833:     if (path.startsWith("/api/roundtable/meetings")) return page_answer({ meetings: [] });
 1834:     if (path.startsWith("/api/roundtable/catalog")) return page_answer({ models: [], defaults: {}, limits: {} });
 1835:     throw new Error(`unexpected fetch ${path}`);
 1836:   };
 1837:   const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
 1838:   const baseStore = {
 1839:     boot: "ready",
 1840:     workspaces: [
 1841:       { id: "ws-a", title: "A" },
 1842:       { id: "ws-b", title: "B" },
 1843:     ],
 1844:     workspaceId: "ws-a",
 1845:     catalog: "ready",
 1846:     models: [{ key: "a/model-1", provider: "a", providerName: "A", model: "model-1" }],
 1847:     catalogDefaults: { rounds: 1 },
 1848:     catalogLimits: { maxAnswerers: 8, maxReviewers: 8, maxRounds: 5 },
 1849:     topic: "保存归属",
 1850:     reviewersMode: "peers",
 1851:     meetingsState: "ready",
 1852:     meetings: [],
 1853:     attachments: [],
 1854:     personaBinding: "opt-in",
 1855:     personas: [],
 1856:     personaBySeat: {},
 1857:     personaForm: { name: "红色攻击者", mission: "找漏洞" },
 1858:   };
 1859:   try {
 1860:     // (1) Late FAILURE from A, settled by hand only after B has edited its
 1861:     // own draft: A's rejection must not touch B's form/note/error/busy.
 1862:     resetStore(baseStore);
 1863:     armPost();
 1864:     const savingA1 = actions.savePersona();
 1865:     await flush();
 1866:     assert.equal(store.get().personaBusy, true, "save starts busy in A");
 1867:     actions.selectWorkspace("ws-b");
 1868:     await flush();
 1869:     actions.setPersonaField("name", "B 的草稿");
 1870:     actions.setPersonaField("mission", "B 的使命");
 1871:     const bForm1 = { ...store.get().personaForm };
 1872:     armedPost.reject(new Error("boom")); // the late failure lands now
 1873:     await savingA1.catch(() => {});
 1874:     await flush();
 1875:     assert.deepEqual(store.get().personaForm, bForm1, "A's late failure does not clear B's form");
 1876:     assert.equal(store.get().personaError, null, "A's late failure does not write B's error");
 1877:     assert.equal(store.get().personaNote, null, "A's late failure writes no note in B");
 1878:     assert.equal(store.get().personaBusy, false, "B is not stuck busy after A's late failure");
 1879:     assert.equal(store.get().workspaceId, "ws-b", "the user is still in B");
 1880: 
 1881:     // (2) A pending while B starts its own save (busy=true): A's late SUCCESS
 1882:     // must not clear busy or the form — B stays busy until B's own POST lands.
 1883:     resetStore(baseStore);
 1884:     armPost();
 1885:     const aPost2 = armedPost;
 1886:     const savingA2 = actions.savePersona();
 1887:     await flush();
 1888:     actions.selectWorkspace("ws-b");
 1889:     await flush();
 1890:     actions.setPersonaField("name", "B 的草稿");
 1891:     const bForm2 = { ...store.get().personaForm };
 1892:     armPost(); // B's POST gets its own deferred
 1893:     const bPost2 = armedPost;
 1894:     const savingB = actions.savePersona();
 1895:     await flush();
 1896:     assert.equal(store.get().personaBusy, true, "B's own save is busy");
 1897:     assert.equal(store.get().personaForm.name, "B 的草稿", "B's save does not clear B's draft");
 1898:     aPost2.resolve(); // A's late success arrives while B is busy
 1899:     await savingA2;
 1900:     await flush();
 1901:     assert.equal(store.get().personaBusy, true, "A's finally must not clear B's busy flag");
 1902:     assert.deepEqual(store.get().personaForm, bForm2, "A's late success does not clear B's form");
 1903:     assert.equal(store.get().personaNote, null, "A's late success does not flash its note in B");
 1904:     assert.equal(store.get().personaError, null, "A's late success sets no error in B");
 1905:     bPost2.resolve(); // B's own POST completes
 1906:     await savingB;

(continuation appended: lines 1907- cover aPost3/bPost3 late-failure with B busy and the same-workspace success control)
 1907:     await flush();
 1908:     assert.equal(store.get().personaBusy, false, "busy clears only when B's own save finishes");
 1909:     assert.deepEqual(store.get().personaForm, { name: "", mission: "" }, "B's successful save clears B's form");
 1910:     assert.ok(store.get().personaNote, "B's successful save shows the note");
 1911: 
 1912:     // (3) Same shape with A's late FAILURE while B is busy: B stays busy and
 1913:     // no error from A leaks into B.
 1914:     resetStore(baseStore);
 1915:     armPost();
 1916:     const aPost3 = armedPost;
 1917:     const savingA3 = actions.savePersona();
 1918:     await flush();
 1919:     actions.selectWorkspace("ws-b");
 1920:     await flush();
 1921:     armPost();
 1922:     const bPost3 = armedPost;
 1923:     const savingB3 = actions.savePersona();
 1924:     await flush();
 1925:     assert.equal(store.get().personaBusy, true, "B's save is busy before A settles");
 1926:     aPost3.reject(new Error("late boom"));
 1927:     await savingA3.catch(() => {});
 1928:     await flush();
 1929:     assert.equal(store.get().personaBusy, true, "A's late failure does not clear B's busy flag");
 1930:     assert.equal(store.get().personaError, null, "A's late failure does not write B's error");
 1931:     assert.equal(store.get().personaNote, null, "A's late failure writes no note in B");
 1932:     bPost3.resolve();
 1933:     await savingB3;
 1934:     await flush();
 1935:     assert.equal(store.get().personaBusy, false, "B's own completion clears busy");
 1936: 
 1937:     // Control: a save that stays in the same workspace still works end to end.
 1938:     resetStore(baseStore);
 1939:     armPost();
 1940:     armedPost.resolve();
 1941:     await actions.savePersona();
 1942:     await flush();
 1943:     assert.deepEqual(store.get().personaForm, { name: "", mission: "" }, "same-workspace save clears the form");
 1944:     assert.ok(store.get().personaNote, "same-workspace save shows the saved note");
 1945:     assert.equal(store.get().personaBusy, false, "same-workspace save clears busy");
 1946:   } finally {
 1947:     globalThis.fetch = previousFetch;
 1948:     armedPost = undefined;
 1949:   }
 1950: });

(continuation appended: lines 1907-1950 cover aPost3/bPost3 late-failure with B busy and the same-workspace success control)
