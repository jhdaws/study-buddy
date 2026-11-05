"""Ticket pricing for CampusEvents -- legacy module (ICA 24A).

This works, and it is tested (see test_legacy_pricing.py), but nobody wants to touch it.
Your job: refactor it without changing behavior, and measure the result with radon.
"""


# event type -> (weekday price, weekend price)
BASE_PRICES = {
    "concert": (20.0, 25.0),
    "lecture": (5.0, 5.0),
    "sports": (12.0, 15.0),
    "workshop": (30.0, 30.0),
}
WEEKEND_DAYS = (5, 6)


def base_price(event_type, day):
    if event_type not in BASE_PRICES:
        raise ValueError("bad type")
    weekday_price, weekend_price = BASE_PRICES[event_type]
    return weekend_price if day in WEEKEND_DAYS else weekday_price


MAX_TICKETS = 10


def validate_quantity(quantity):
    if quantity <= 0:
        raise ValueError("bad qty")
    if quantity > MAX_TICKETS:
        raise ValueError("too many")


def role_multiplier(user):
    if user is None:
        return 1.0
    role = user.get("role")
    if role == "student":
        return 0.8 if user.get("verified") else 0.9
    if role == "staff":
        return 0.85
    if role == "alumni":
        return 0.85 if user.get("years", 0) >= 10 else 0.95
    return 1.0


BULK_MIN_QTY = 5
BULK_DISCOUNT = 5.0  # flat amount off the order, not per ticket


def bulk_discount(event_type, quantity):
    if quantity >= BULK_MIN_QTY and event_type != "workshop":
        return BULK_DISCOUNT
    return 0.0


def coupon_multiplier(code, event_type, user):
    # A recognised coupon that does not apply is silently ignored; an unknown one raises.
    if code is None:
        return 1.0
    if code == "WELCOME10":
        return 0.9 if user is not None and user.get("first_purchase") else 1.0
    if code == "HALFOFF":
        return 0.5 if event_type == "lecture" else 1.0
    if code == "FREEDRINK":
        return 1.0  # accepted, but has no effect on price
    raise ValueError("bad coupon")


# (upper bound, exclusive) -> fee; totals at or above the last bound pay TOP_FEE
FEE_BANDS = ((20, 1.0), (100, 2.5))
TOP_FEE = 5.0


def service_fee(total):
    if total <= 0:
        return 0.0
    for upper_bound, fee in FEE_BANDS:
        if total < upper_bound:
            return fee
    return TOP_FEE


def calc(t, q, u, d, c=None, w=False):
    # t = event type, q = quantity, u = user dict, d = day of week (0=Mon..6=Sun),
    # c = coupon code, w = waitlist
    p = base_price(t, d)
    validate_quantity(q)
    total = p * q
    total = total * role_multiplier(u)
    total = total - bulk_discount(t, q)
    total = total * coupon_multiplier(c, t, u)
    if w:
        total = total + 2.0
    if total < 0:
        total = 0.0
    return round(total + service_fee(total), 2)
