# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["chatterbox-mlx==1.3.1"]
# ///
"""Fine-tune Chatterbox Turbo T3 with MLX LoRA; keep base speech decoder frozen."""
import argparse,json,random,time
from pathlib import Path
import numpy as np
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten, tree_unflatten
from voice_runtime import ROOT,PROFILE,load_voice

class LoRALinear(nn.Module):
    def __init__(self,base,rank=8,scale=1.0):
        super().__init__();self.base=base;self.base.freeze()
        self.lora_a=mx.random.normal((base.weight.shape[1],rank))*0.01
        self.lora_b=mx.zeros((rank,base.weight.shape[0]));self.scale=scale
    def __call__(self,x):
        return self.base(x)+(self.scale*(x.astype(mx.float32)@self.lora_a@self.lora_b)).astype(x.dtype)
    def merged(self):
        layer=nn.Linear(self.base.weight.shape[1],self.base.weight.shape[0],bias='bias' in self.base)
        layer.weight=self.base.weight+self.scale*(self.lora_a@self.lora_b).T.astype(self.base.weight.dtype)
        if 'bias' in self.base:layer.bias=self.base.bias
        return layer


def speech_loss(t3,text,speech,conditioning):
    # Match inference exactly: [fixed reference | text | SOS | previous speech] predicts speech + EOS.
    targets=mx.concatenate([speech,mx.array([t3.hp.stop_speech_token],dtype=mx.int32)])
    inputs=mx.concatenate([mx.array([t3.hp.start_speech_token],dtype=mx.int32),speech])
    x=mx.concatenate([conditioning,t3.text_emb(text[None]),t3.speech_emb(inputs[None])],axis=1)
    x=x+t3.tfmr.wpe(mx.arange(x.shape[1]))[None]
    for block in t3.tfmr.h:
        attended,_,_=block.attn.cond(block.ln_1(x))
        x=x+attended;x=x+block.mlp(block.ln_2(x))
    offset=conditioning.shape[1]+text.shape[0]
    logits=t3.speech_head(t3.tfmr.ln_f(x[:,offset:])).astype(mx.float32)
    return nn.losses.cross_entropy(logits[0],targets,reduction='mean')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dataset',type=Path,default=ROOT/'voices/dora/dataset')
    p.add_argument('--steps',type=int,default=200)
    p.add_argument('--reference',type=Path,default=ROOT/'voices/dora/reference-training.wav')
    p.add_argument('--rank',type=int,default=8)
    p.add_argument('--layers',type=int,default=8)
    p.add_argument('--learning-rate',type=float,default=1e-4)
    a=p.parse_args();out=ROOT/'voices/dora/checkpoints';out.mkdir(exist_ok=True)
    if a.steps<1 or a.rank<1 or not 1<=a.layers<=24:raise ValueError('Invalid training settings.')
    random.seed(42);mx.random.seed(42)
    model,_=load_voice(use_adapter=False,reference_override=a.reference);model.t3.finalize('float32')
    conditioning=model._t3_cond_emb.astype(mx.float32);mx.eval(conditioning)
    train=[json.loads(s) for s in (a.dataset/'train.jsonl').read_text().splitlines()]
    valid=[json.loads(s) for s in (a.dataset/'valid.jsonl').read_text().splitlines()]
    if not train or not valid:raise ValueError('Both training and held-out validation clips are required.')
    assert {r['episode'] for r in train}.isdisjoint({r['episode'] for r in valid})
    cache=a.dataset/'tokens.npz'
    if not cache.exists():
        import librosa,torch
        torch.set_num_threads(4)
        tokens={}
        for i,row in enumerate(train+valid):
            wav,_=librosa.load(a.dataset/row['audio'],sr=16000)
            with torch.inference_mode():
                codes,lengths=model.pt_s3gen.tokenizer.forward([wav])
            count=int(lengths.reshape(-1)[0]);codes=codes.reshape(-1)[:count].cpu().numpy().astype(np.int32)
            tokens[row['id']]=codes
            print(f'Tokenized {i+1}/{len(train+valid)} {row["id"]} ({len(codes)} tokens)',flush=True)
        np.savez(cache,**tokens)
    tokens=np.load(cache)
    def pack(rows):
        return [(mx.array(model.tokenizer(row['text'],return_tensors='np').input_ids[0].astype(np.int32)),mx.array(tokens[row['id']])) for row in rows]
    training=pack(train);validation=pack(valid)
    t3=model.t3;t3.freeze();targets=[]
    for i in range(len(t3.tfmr.h)-a.layers,len(t3.tfmr.h)):
        for attr in ['c_attn','c_proj']:
            name=f'tfmr.h.{i}.attn.{attr}';targets.append(name)
        for attr in ['c_fc','c_proj']:
            targets.append(f'tfmr.h.{i}.mlp.{attr}')
    modules=dict(t3.named_modules())
    t3.update_modules(tree_unflatten([(name,LoRALinear(modules[name],a.rank)) for name in targets]))
    trainable=sum(v.size for _,v in tree_flatten(t3.trainable_parameters()))
    if not trainable or trainable>10_000_000:raise RuntimeError(f'Unexpected trainable parameter count: {trainable}')
    print('Trainable LoRA parameters:',trainable,flush=True)
    loss_grad=nn.value_and_grad(t3,speech_loss)
    optimizer=optim.Adam(learning_rate=a.learning_rate)
    def evaluate():
        losses=[float(speech_loss(t3,t,s,conditioning).item()) for t,s in validation]
        return float(np.mean(losses))
    baseline=evaluate();best=baseline
    print(f'Baseline held-out speech-token loss: {baseline:.4f}',flush=True)
    history=[];started=time.perf_counter()
    before={name:mx.array(modules[name].weight) for name in targets}
    order=list(range(len(training)))
    for step in range(1,a.steps+1):
        if (step-1)%len(order)==0:random.shuffle(order)
        text,speech=training[order[(step-1)%len(order)]]
        loss,grads=loss_grad(t3,text,speech,conditioning)
        grads,norm=optim.clip_grad_norm(grads,max_norm=1.0)
        optimizer.update(t3,grads);mx.eval(loss,t3.trainable_parameters(),optimizer.state)
        value=float(loss.item())
        if not np.isfinite(value):raise RuntimeError('Non-finite training loss; stopped without publishing checkpoint.')
        if step==1 or step%10==0:
            print(f'Step {step}/{a.steps}: loss={value:.4f}, elapsed={time.perf_counter()-started:.1f}s',flush=True)
        if step%25==0 or step==a.steps:
            val=evaluate();history.append({'step':step,'train_loss':value,'valid_loss':val})
            print(f'Validation {step}: {val:.4f}',flush=True)
            if val<best:
                best=val
                weights=dict(tree_flatten(t3.trainable_parameters()))
                mx.save_safetensors(str(out/'adapter.safetensors'),weights)
                fused={}
                current=dict(t3.named_modules())
                for name in targets:
                    layer=current[name].merged()
                    fused[name+'.weight']=layer.weight
                    if 'bias' in layer:fused[name+'.bias']=layer.bias
                mx.save_safetensors(str(out/'t3-dora-delta.safetensors'),fused)
                (out/'adapter.json').write_text(json.dumps({'base_model':'ResembleAI/chatterbox-turbo','rank':a.rank,'layers':a.layers,'step':step,'baseline_valid_loss':baseline,'valid_loss':val,'training_clips':len(train),'validation_clips':len(valid),'training_episodes':sorted({r['episode'] for r in train}),'validation_episodes':sorted({r['episode'] for r in valid}),'reference':str(PROFILE),'type':'MLX LoRA fine-tune; fused replacement weights for adapted T3 layers'},indent=2))
            (out/'training-history.json').write_text(json.dumps(history,indent=2))
    current=dict(t3.named_modules())
    assert all(bool(mx.array_equal(current[name].base.weight,before[name]).item()) for name in targets),'Frozen base weights unexpectedly changed'
    print(f'Done. Best held-out loss {best:.4f}, baseline {baseline:.4f}. Checkpoints: {out}',flush=True)

if __name__=='__main__':main()
