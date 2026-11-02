//! POST /idl/convert: a legacy (pre-0.30) Anchor IDL in the 0.30+ format, by Anchor's own converter.

use serde_json::Value;

pub fn convert(body: &[u8]) -> Result<Value, String> {
    let json: Value = serde_json::from_slice(body).map_err(|error| format!("The body is not JSON: {error}"))?;
    if !json.get("instructions").is_some_and(Value::is_array) {
        return Err("Not an Anchor IDL: there is no instructions array".into());
    }
    let idl = anchor_lang_idl::convert::convert_idl(body).map_err(|error| format!("Anchor could not convert this IDL: {error}"))?;
    serde_json::to_value(idl).map_err(|error| format!("The converted IDL could not be written: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn converts_a_legacy_idl() {
        let legacy = json!({
            "version": "0.1.0",
            "name": "counter",
            "instructions": [{
                "name": "incrementBy",
                "accounts": [{ "name": "counter", "isMut": true, "isSigner": false }, { "name": "authority", "isMut": false, "isSigner": true }],
                "args": [{ "name": "amount", "type": "u64" }]
            }],
            "errors": [{ "code": 6000, "name": "Overflow", "msg": "Counter overflowed" }],
            "metadata": { "address": "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD" }
        });
        let modern = convert(legacy.to_string().as_bytes()).unwrap();
        assert_eq!(modern["address"], "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
        let ix = &modern["instructions"][0];
        assert_eq!(ix["name"], "increment_by");
        assert_eq!(ix["discriminator"].as_array().unwrap().len(), 8);
        assert_eq!(ix["accounts"][0]["writable"], true);
        assert_eq!(ix["accounts"][1]["signer"], true);
        assert_eq!(modern["errors"][0]["name"], "Overflow");
    }

    #[test]
    fn refuses_a_legacy_idl_without_its_program() {
        let legacy = json!({ "version": "0.1.0", "name": "x", "instructions": [] });
        assert!(convert(legacy.to_string().as_bytes()).unwrap_err().contains("metadata.address"));
    }

    #[test]
    fn refuses_what_is_not_an_idl() {
        assert_eq!(convert(b"{}").unwrap_err(), "Not an Anchor IDL: there is no instructions array");
        assert!(convert(b"nope").unwrap_err().starts_with("The body is not JSON"));
    }
}
