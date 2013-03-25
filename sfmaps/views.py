from pyramid.view import view_config
import os


@view_config(route_name='home', renderer='templates/0.pt')
def my_view(request):
    return {}

last_timestamp = 0
@view_config(route_name='refresh', renderer='json')
def refresh(request):
    global last_timestamp
    curr_timestamp = os.path.getmtime('sfmaps/static/sfmaps.js')
    refresh = last_timestamp < curr_timestamp
    last_timestamp = curr_timestamp
    return refresh
    




