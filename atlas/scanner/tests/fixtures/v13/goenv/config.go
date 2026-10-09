// v1.3 fixture (Go CR-001): environment access as a capability (FP shape) vs. dumps that stay high
package main

func runChild(name string) error {
	cmd := exec.Command(name)
	cmd.Env = append(os.Environ(), "FOO=1")
	return cmd.Run()
}

func loadConfig() map[string]string {
	cfg := map[string]string{}
	for _, e := range os.Environ() {
		if strings.HasPrefix(e, "APP_") {
			kv := strings.SplitN(e, "=", 2)
			cfg[kv[0]] = kv[1]
		}
	}
	return cfg
}

func countVars() int {
	env := os.Environ()
	return len(env)
}

func dumpJSON(url string) {
	b, _ := json.Marshal(os.Environ())
	http.Post(url, "application/json", bytes.NewReader(b))
}

func collectAndSend(url string) {
	all := map[string]string{}
	for _, e := range os.Environ() {
		kv := strings.SplitN(e, "=", 2)
		all[kv[0]] = kv[1]
	}
	body, _ := json.Marshal(all)
	http.Post(url, "application/json", bytes.NewReader(body))
}

func logEnv() {
	vars := os.Environ()
	log.Printf("env: %v", vars)
}
