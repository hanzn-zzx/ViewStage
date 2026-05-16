use image::DynamicImage;
use base64::{Engine as _, engine::general_purpose};

const MAX_IMAGE_SIZE: usize = 50 * 1024 * 1024;

pub fn image_load_base64(image_data: &str) -> Result<DynamicImage, String> {
    let base64_data = if image_data.starts_with("data:image") {
        image_data.split(',')
            .nth(1)
            .ok_or("Invalid base64 image data")?
            .to_string()
    } else {
        image_data.to_string()
    };
    
    if base64_data.len() > MAX_IMAGE_SIZE * 4 / 3 {
        return Err("Image data too large (max 50MB)".to_string());
    }
    
    let decoded = general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    let img = image::load_from_memory(&decoded)
        .map_err(|e| format!("Failed to load image: {}", e))?;
    
    if img.width() == 0 || img.height() == 0 {
        return Err("Invalid image dimensions: width or height is zero".to_string());
    }
    
    Ok(img)
}

pub fn image_fetch_base64_data(image_data: &str) -> Result<Vec<u8>, String> {
    let base64_data = if image_data.starts_with("data:image") {
        image_data.split(',')
            .nth(1)
            .ok_or("Invalid base64 image data")?
    } else {
        image_data
    };
    
    general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))
}

#[tauri::command]
pub fn image_update_rotation(image_data: String, direction: String) -> Result<String, String> {
    let img = image_load_base64(&image_data)?;
    
    let rotated = if direction == "left" {
        img.rotate270()
    } else {
        img.rotate90()
    };
    
    let mut buffer = Vec::new();
    rotated
        .write_to(&mut std::io::Cursor::new(&mut buffer), image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode rotated image: {}", e))?;
    
    let result = format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&buffer));
    
    Ok(result)
}
