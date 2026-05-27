from fastapi import APIRouter, HTTPException

from auth.router import require_admin
from fastapi import Depends

from .service import flag_card_as_feature_request, unflag_card, get_queue, get_history, merge_to_main

router = APIRouter(prefix="/autocode", tags=["autocode"])


@router.post("/flag/{card_id}")
def flag_card(card_id: str, username: str = Depends(require_admin)):
    result = flag_card_as_feature_request(card_id, username)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.delete("/flag/{card_id}", status_code=204)
def unflag(card_id: str, _: str = Depends(require_admin)):
    if not unflag_card(card_id):
        raise HTTPException(
            status_code=409, detail="Cannot unflag a card that is currently being built"
        )


@router.get("/queue")
def queue(_: str = Depends(require_admin)):
    return get_queue()


@router.get("/history")
def history(_: str = Depends(require_admin)):
    return get_history()


@router.post("/merge/{card_id}")
def merge(card_id: str, _: str = Depends(require_admin)):
    result = merge_to_main(card_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
