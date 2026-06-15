use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSchema {
    pub id: String,
    pub name: String,
    pub media_type: String,
    pub groups: Vec<ParameterGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterGroup {
    pub id: String,
    pub label: String,
    pub fields: Vec<ParameterField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterField {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub default: Value,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
    #[serde(default)]
    pub options: Vec<SelectOption>,
    #[serde(default)]
    pub presets: Vec<ResolutionPreset>,
    #[serde(default)]
    pub bindings: Vec<FieldBinding>,
    #[serde(default)]
    pub visible_when: Option<VisibleWhen>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectOption {
    pub label: String,
    pub value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolutionPreset {
    pub label: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldBinding {
    #[serde(default)]
    pub node_id: Option<String>,
    pub input: String,
    #[serde(default)]
    pub transform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibleWhen {
    pub field: String,
    pub equals: Value,
}

pub fn default_params(schema: &ModelSchema) -> Value {
    let mut map = serde_json::Map::new();
    for group in &schema.groups {
        for field in &group.fields {
            map.insert(field.id.clone(), field.default.clone());
        }
    }
    Value::Object(map)
}

pub fn validate_params(schema: &ModelSchema, params: &Value) -> Result<(), String> {
    let obj = params
        .as_object()
        .ok_or_else(|| "Parameters must be an object".to_string())?;

    for group in &schema.groups {
        for field in &group.fields {
            let value = obj
                .get(&field.id)
                .unwrap_or(&field.default);

            match field.field_type.as_str() {
                "slider" | "number" => {
                    let num = value.as_f64().ok_or_else(|| {
                        format!("Field {} must be a number", field.id)
                    })?;
                    if let Some(min) = field.min {
                        if num < min {
                            return Err(format!("{} must be >= {min}", field.label));
                        }
                    }
                    if let Some(max) = field.max {
                        if num > max {
                            return Err(format!("{} must be <= {max}", field.label));
                        }
                    }
                }
                "text" => {
                    if !value.is_string() {
                        return Err(format!("Field {} must be text", field.id));
                    }
                }
                _ => {}
            }
        }
    }
    Ok(())
}
