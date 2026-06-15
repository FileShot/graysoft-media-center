use crate::models::{load_schema_by_id, ModelSchema};
use serde_json::{json, Map, Value};

pub fn build_pipeline_params(
    schema_id: &str,
    params: &Value,
    prompt: &str,
    negative_prompt: &str,
) -> Result<Value, String> {
    let schema = load_schema_by_id(schema_id)?;
    let mut map = params.as_object().cloned().unwrap_or_default();
    map.insert("prompt".to_string(), json!(prompt));
    map.insert("negative_prompt".to_string(), json!(negative_prompt));

    if map.get("frame_count").is_none() {
        if let (Some(duration), Some(fps)) = (
            map.get("duration").and_then(|v| v.as_f64()),
            map.get("fps").and_then(|v| v.as_f64()),
        ) {
            map.insert(
                "frame_count".to_string(),
                json!((duration * fps).round() as u64),
            );
        }
    }

    if map.get("num_frames").is_none() {
        if let Some(fc) = map.get("frame_count") {
            map.insert("num_frames".to_string(), fc.clone());
        }
    }

    let pipeline = schema_to_pipeline_kwargs(&schema, &map);
    Ok(Value::Object(pipeline))
}

fn schema_to_pipeline_kwargs(schema: &ModelSchema, values: &Map<String, Value>) -> Map<String, Value> {
    let mut out = Map::new();

    for group in &schema.groups {
        for field in &group.fields {
            let value = values
                .get(&field.id)
                .cloned()
                .unwrap_or_else(|| field.default.clone());

            if field.bindings.is_empty() {
                out.insert(field.id.clone(), transform_value(&value, None));
                continue;
            }

            for binding in &field.bindings {
                let key = if binding.input.is_empty() {
                    field.id.clone()
                } else {
                    binding.input.clone()
                };
                out.insert(
                    key,
                    transform_value(&value, binding.transform.as_deref()),
                );
            }
        }
    }

    out
}

fn transform_value(value: &Value, transform: Option<&str>) -> Value {
    match transform {
        Some("int") => json!(value.as_f64().unwrap_or(0.0) as i64),
        Some("seed") => {
            if value.as_i64() == Some(-1) {
                json!(rand_seed())
            } else {
                value.clone()
            }
        }
        Some("bool") => json!(value.as_bool().unwrap_or(false)),
        Some("string") => json!(value.as_str().unwrap_or("").to_string()),
        _ => value.clone(),
    }
}

fn rand_seed() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| (d.as_nanos() % 9_000_000_000_000_000) as i64)
        .unwrap_or(42)
}
