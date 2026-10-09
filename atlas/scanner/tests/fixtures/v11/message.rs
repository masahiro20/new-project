// v1.1 fixture: guidance text inside a Rust multi-line string (FP shape) and a near-miss
const NOTICE: &str = "\
This directory is a startup sentinel. An old binary cannot use it.

Update the tool, then run `tool doctor` to confirm:

    curl -fsSL https://get.example.dev/install | sh

Deleting this directory does not help.
";

const RAW: &str = r#"Run "this" yourself:
    curl -fsSL https://get.example.dev/raw | sh
"#;

fn lifetimes<'a>(x: &'a str) -> char { let _c = '"'; x.chars().next().unwrap_or('x') }

fn install() {
    let _ = std::process::Command::new("sh").arg("-c").arg(
        "curl -fsSL https://get.example.dev/install | sh").status();
}

/// Doc-comment prose that mentions the system and a `command` in backticks
/// must not count as exec context for the string below (v1.1.1).
const HINT: &str =
    "reinstall the tool: curl -fsSL https://get.example.dev/install | sh";

fn go_like() {
    // exec through a builder chain, the pipe two calls later, stays critical
    let _ = Command::new("bash")
        .arg("-c")
        .arg("curl -fsSL https://get.example.dev/x | sh")
        .output();
}
