fn main() {
    #[cfg(target_os = "windows")]
    {
        let manifest_dir_str = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let manifest_dir = std::path::Path::new(&manifest_dir_str);
        let memreduct_exe = manifest_dir.join("../memreduct/bin/64/memreduct-viewstage.exe");

        if !memreduct_exe.exists() {
            println!("cargo:warning=memreduct-viewstage.exe not found — building C++ project...");

            let ps1 = manifest_dir.join("../memreduct/dev-memreduct.ps1");
            let status = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    &ps1.display().to_string(),
                ])
                .status();

            match status {
                Ok(s) if s.success() => {
                    if memreduct_exe.exists() {
                        println!("cargo:warning=memreduct-viewstage.exe built successfully");
                    } else {
                        println!("cargo:warning=dev-memreduct.ps1 exited OK but binary still missing");
                    }
                }
                Ok(_) => {
                    println!("cargo:warning=dev-memreduct.ps1 failed (exit code non-zero)");
                    println!("cargo:warning=Run memreduct\\dev-memreduct.ps1 manually before cargo tauri build");
                }
                Err(e) => {
                    println!("cargo:warning=could not launch powershell: {e}");
                    println!("cargo:warning=Run memreduct\\dev-memreduct.ps1 manually before cargo tauri build");
                }
            }
        }
    }

    tauri_build::build()
}
