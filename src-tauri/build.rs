fn main() {
  let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
  let config_path = manifest_dir.join("tauri.conf.json");
  let config = std::fs::read_to_string(&config_path).expect("read tauri.conf.json");
  let identifier = parse_identifier(&config).expect("tauri.conf.json must have identifier");
  println!("cargo:rustc-env=TAURI_APP_IDENTIFIER={}", identifier);
  tauri_build::build();
}

fn parse_identifier(json: &str) -> Option<&str> {
  let key = "\"identifier\"";
  let start = json.find(key)? + key.len();
  let value_start = json[start..].find('"')? + 1 + start;
  let value_end = value_start + json[value_start..].find('"')?;
  Some(json[value_start..value_end].trim())
}
