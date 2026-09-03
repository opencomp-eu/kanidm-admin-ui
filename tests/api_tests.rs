#[cfg(test)]
mod tests {
    use kanidm_admin_ui::config::Config;
    use kanidm_admin_ui::kanidm::{Entry, Filter, KanidmClient, Modify, ModifyList, ModifyRequest};
    use std::collections::HashMap;

    fn test_config() -> Config {
        Config {
            listen_addr: "127.0.0.1:8080".into(),
            kanidm_url: "https://localhost:8443".into(),
            kanidm_public_url: "https://localhost:8443".into(),
            kanidm_tls_ca_file: None,
            kanidm_api_token: "test_token".into(),
            admin_group: "idm_admins".into(),
            oidc_issuer_url: None,
            oidc_client_id: None,
            oidc_client_secret: None,
            cookie_secret: "dGVzdHNlY3JldHNlY3JldHNlY3JldA==".into(),
            external_url: "http://localhost:8080".into(),
        }
    }

    #[test]
    fn test_filter_serialization() {
        let f = Filter::eq("name", "testuser");
        let json = serde_json::to_value(&f).unwrap();
        assert_eq!(json, serde_json::json!({"eq": ["name", "testuser"]}));
    }

    #[test]
    fn test_filter_or() {
        let f = Filter::or(vec![
            Filter::cnt("name", "admin"),
            Filter::cnt("displayname", "admin"),
        ]);
        let json = serde_json::to_value(&f).unwrap();
        assert!(json["or"].is_array());
        assert_eq!(json["or"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_modify_present() {
        let m = Modify::present("status", "disabled");
        let json = serde_json::to_value(&m).unwrap();
        assert_eq!(json, serde_json::json!({"present": ["status", "disabled"]}));
    }

    #[test]
    fn test_modify_request_serialization() {
        let req = ModifyRequest {
            filter: Filter::eq("name", "testuser"),
            modlist: ModifyList {
                mods: vec![Modify::present("status", "disabled")],
            },
        };
        let json = serde_json::to_value(&req).unwrap();
        assert!(json["filter"]["eq"].is_array());
        assert!(json["modlist"]["mods"].is_array());
    }

    #[test]
    fn test_entry_attrs() {
        let mut attrs = HashMap::new();
        attrs.insert("name".into(), vec!["testuser".into()]);
        attrs.insert("displayname".into(), vec!["Test User".into()]);
        let entry = Entry { attrs };
        assert_eq!(
            entry.attrs.get("name").unwrap(),
            &vec!["testuser".to_string()]
        );
    }

    #[test]
    fn test_config_from_env() {
        std::env::remove_var("KANIDM_URL");
        std::env::remove_var("KANIDM_API_TOKEN");
        let result = Config::from_env();
        assert!(result.is_err());
    }

    #[test]
    fn test_config_oidc_disabled() {
        let config = test_config();
        assert!(!config.oidc_enabled());
    }

    #[test]
    fn test_config_oidc_enabled() {
        let mut config = test_config();
        config.oidc_issuer_url =
            Some("https://kanidm.example.com/oauth2/openid/kanidm_admin_ui".into());
        config.oidc_client_id = Some("client_id".into());
        config.oidc_client_secret = Some("secret".into());
        assert!(config.oidc_enabled());
    }

    #[test]
    fn test_client_creation() {
        let config = test_config();
        KanidmClient::new(&config).unwrap();
    }

    #[test]
    fn test_entry_serialization_for_create() {
        let mut attrs = HashMap::new();
        attrs.insert("name".into(), vec!["testuser".into()]);
        attrs.insert("displayname".into(), vec!["Test User".into()]);
        let entry = Entry { attrs };
        let json = serde_json::to_value(&entry).unwrap();
        assert!(json["attrs"].is_object());
        assert_eq!(json["attrs"]["name"], serde_json::json!(["testuser"]));
        assert_eq!(
            json["attrs"]["displayname"],
            serde_json::json!(["Test User"])
        );
    }

    #[test]
    fn validate_identifier_accepts_names_uuids_and_spns() {
        for ok in [
            "alice",
            "idm_admins@example.com",
            "3f7c3ade-6af7-4d99-9d1b-6a7f8e2b1c00",
            "svc_account-1",
        ] {
            assert!(
                kanidm_admin_ui::routes::validate_identifier(ok).is_ok(),
                "should accept {ok:?}"
            );
        }
    }

    #[test]
    fn validate_identifier_rejects_path_injection() {
        for bad in [
            "",
            ".",
            "..",
            "a/b",
            "../v1/self",
            "%2e%2e",
            "..%2Fv1",
            "a?b=c",
            "a#b",
            "a b",
            "a&b",
            "a+b",
        ] {
            assert!(
                kanidm_admin_ui::routes::validate_identifier(bad).is_err(),
                "should reject {bad:?}"
            );
        }
    }
}
