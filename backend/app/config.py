from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:////data/wimm.db"
    sql_echo: bool = False

    log_level: str = "INFO"
    log_format: str = "text"
    log_dir: str = "/logs/backend"

    ml_min_confidence: float = 0.3
    ml_min_training_samples: int = 5
    ml_ngram_min: int = 1
    ml_ngram_max: int = 2
    ml_max_features: int = 5000
    ml_top_k: int = 3

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
