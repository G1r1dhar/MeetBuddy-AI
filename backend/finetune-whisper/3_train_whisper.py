import os
import torch
from dataclasses import dataclass
from typing import Any, Dict, List, Union
from datasets import load_from_disk
from transformers import (
    WhisperForConditionalGeneration,
    WhisperFeatureExtractor,
    WhisperTokenizer,
    WhisperProcessor,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer
)
import evaluate
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Directory setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROCESSED_DATA_DIR = os.path.join(BASE_DIR, 'dataset', 'processed', 'whisper_dataset')
OUTPUT_DIR = os.path.join(BASE_DIR, 'meetbuddy-whisper-small-finetuned')

MODEL_ID = "openai/whisper-small"

@dataclass
class DataCollatorSpeechSeq2SeqWithPadding:
    """
    Data collator that will dynamically pad the inputs received.
    For Whisper, we pad the `input_features` to the model's max_length
    and the `labels` to the max sequence length of the batch.
    """
    processor: Any

    def __call__(self, features: List[Dict[str, Union[List[int], torch.Tensor]]]) -> Dict[str, torch.Tensor]:
        # Split inputs and labels since they have to be padded differently
        input_features = [{"input_features": feature["input_features"]} for feature in features]
        # Pad input_features
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")

        # Get the tokenized label sequences
        label_features = [{"input_ids": feature["labels"]} for feature in features]
        # Pad the labels to max length
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")

        # Replace padding with -100 to ignore loss correctly
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)

        # If bos token is appended in previous tokenization step, cut bos token here as it's append later anyways
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch

def compute_metrics(pred, processor, metric):
    """Calculates WER for evaluation."""
    pred_ids = pred.predictions
    label_ids = pred.label_ids

    # Replace -100 with the pad_token_id
    label_ids[label_ids == -100] = processor.tokenizer.pad_token_id

    # We do not want to group tokens when computing the metrics
    pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
    label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)

    wer = 100 * metric.compute(predictions=pred_str, references=label_str)
    return {"wer": wer}

def main():
    logger.info("Starting Whisper Fine-Tuning Pipeline...")
    
    # 1. Load Preprocessed Dataset
    if not os.path.exists(PROCESSED_DATA_DIR):
        raise FileNotFoundError(f"Dataset not found at {PROCESSED_DATA_DIR}. Run 2_preprocess_data.py first.")
        
    logger.info("Loading preprocessed dataset from disk...")
    dataset = load_from_disk(PROCESSED_DATA_DIR)
    
    # 2. Load Model, Processor and Evaluator
    logger.info(f"Loading base model: {MODEL_ID}")
    feature_extractor = WhisperFeatureExtractor.from_pretrained(MODEL_ID)
    tokenizer = WhisperTokenizer.from_pretrained(MODEL_ID, language="English", task="transcribe")
    processor = WhisperProcessor.from_pretrained(MODEL_ID, language="English", task="transcribe")
    
    model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID)
    
    # Required for fine-tuning
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = []
    
    # 3. Setup Data Collator and Metrics
    data_collator = DataCollatorSpeechSeq2SeqWithPadding(processor=processor)
    metric = evaluate.load("wer")
    
    # Wrap metric compute in lambda
    compute_metrics_fn = lambda pred: compute_metrics(pred, processor, metric)

    # 4. Training Arguments
    # These are standard hypers for Whisper fine-tuning on a small custom dataset
    training_args = Seq2SeqTrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=8, # Decrease if running out of VRAM (e.g. 4 or 2)
        gradient_accumulation_steps=2,
        learning_rate=1e-5,
        warmup_steps=50,
        max_steps=1000,
        gradient_checkpointing=True,
        fp16=True, # Mixed precision (requires CUDA)
        evaluation_strategy="steps",
        per_device_eval_batch_size=4,
        predict_with_generate=True,
        generation_max_length=225,
        save_steps=250,
        eval_steps=250,
        logging_steps=25,
        report_to=["tensorboard"],
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        push_to_hub=False,
    )
    
    # 5. Initialize Trainer
    trainer = Seq2SeqTrainer(
        args=training_args,
        model=model,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        data_collator=data_collator,
        compute_metrics=compute_metrics_fn,
        tokenizer=processor.feature_extractor,
    )
    
    # 6. Train!
    logger.info("Beginning Training Loop. This will take a while.")
    
    # Ensure tensor cores are utilized if available
    torch.set_float32_matmul_precision('high')
    
    trainer.train()
    
    # 7. Save Final Model
    logger.info(f"Training Complete. Saving best model to {OUTPUT_DIR}")
    model.save_pretrained(OUTPUT_DIR)
    processor.save_pretrained(OUTPUT_DIR)

if __name__ == "__main__":
    main()
