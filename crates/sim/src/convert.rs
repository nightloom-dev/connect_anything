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

    /// The legacy IDL klend has on chain becomes the modern copy the Kamino recipe was built on.
    #[test]
    fn converts_the_klend_idl_on_chain() {
        use base64::Engine;
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read = |path: &str| serde_json::from_slice::<Value>(&std::fs::read(root.join(path)).unwrap()).unwrap();
        // an IDL account: 8 bytes of discriminator, the authority, a u32 length and the zlib-compressed JSON
        let account = read("packages/core/test/fixtures/klend.idl-account.json");
        let data = base64::engine::general_purpose::STANDARD.decode(account["data"].as_str().unwrap()).unwrap();
        let length = u32::from_le_bytes(data[40..44].try_into().unwrap()) as usize;
        let mut legacy: Value = serde_json::from_slice(&miniz_oxide::inflate::decompress_to_vec_zlib(&data[44..44 + length]).unwrap()).unwrap();
        assert!(legacy.get("address").is_none(), "klend's IDL on chain is legacy");
        // as packages/core sends it: with the program id that the legacy format leaves out
        legacy["metadata"] = json!({ "address": account["programId"] });

        let modern = convert(legacy.to_string().as_bytes()).unwrap();
        assert_eq!(modern, read("recipes/kamino-rescue/klend.idl.json"));
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
